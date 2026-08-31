import { useMemo, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Filter,
  Flame,
  FolderKanban,
  Heart,
  Layers3,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  X
} from 'lucide-react'
import type { ReviewRating } from '@shared/types'
import { createKnowledgeSearchIndex } from '../../core/search'
import {
  buildTodayQueue,
  calculateStreak,
  completionRatio,
  docsByKind,
  filterCards,
  getCardState,
  groupBy,
  isDue,
  learningStatusLabel,
  masteryCounts,
  previousDays,
  ratingHint,
  ratingLabel,
  settingsSummary,
  uniqueValues,
  weakDomains
} from './lib'
import {
  CardTile,
  DocumentTile,
  EmptyState,
  MetricCard,
  PageIntro,
  ProgressBar,
  QuickLegend,
  SectionHeading,
  StateBadge,
  ValuePill
} from './components'
import { useAppStore } from './store'

const ratings: ReviewRating[] = ['again', 'hard', 'good', 'easy']

export function TodayView(): React.JSX.Element {
  const snapshot = useAppStore((state) => state.snapshot)
  const learning = useAppStore((state) => state.learning)
  const selectCard = useAppStore((state) => state.selectCard)
  const applyLearningAction = useAppStore((state) => state.applyLearningAction)
  const navigate = useAppStore((state) => state.navigate)
  const queue = useMemo(() => buildTodayQueue(snapshot, learning), [snapshot, learning])
  const streak = calculateStreak(learning?.studyDays ?? [])
  const ratio = completionRatio(snapshot, learning)
  const counts = masteryCounts(snapshot, learning)
  const weak = weakDomains(snapshot, learning).slice(0, 4)
  const dueCount = queue.filter((card) => isDue(learning?.cards[card.id])).length
  const todayMinutes = Math.min(learning?.settings.dailyMinutes ?? 20, Math.max(0, (learning?.reviews ?? []).filter((review) => review.reviewedAt.startsWith(new Date().toISOString().slice(0, 10))).length * 4))

  return (
    <div className="page today-page">
      <PageIntro
        eyebrow="TODAY · STUDY FLOW"
        title={greeting()}
        description={settingsSummary(learning?.settings)}
        actions={<div className="date-chip"><CalendarClock size={16} />{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</div>}
      />

      <section className="hero-card">
        <div className="hero-glow" />
        <div className="hero-copy">
          <span className="hero-kicker"><Sparkles size={15} />今天值得投入的 20 分钟</span>
          <h2>{queue.length ? `有 ${queue.length} 张经验卡等你掌握` : '今天的复习已完成'}</h2>
          <p>{queue.length ? `先处理 ${dueCount} 张到期复习，再认识 ${queue.length - dueCount} 条高价值新经验。` : '可以去面试训练再练一轮，或自由浏览经验库。'}</p>
          <div className="hero-actions">
            <button className="primary-button light" onClick={() => queue[0] ? selectCard(queue[0].id) : navigate('library')} type="button">
              {queue.length ? '开始今日学习' : '自由浏览经验'}<ArrowRight size={17} />
            </button>
            <span><Clock3 size={15} />预计 {Math.max(6, queue.length * 4)} 分钟</span>
          </div>
        </div>
        <div className="hero-progress-ring" style={{ '--value': `${ratio * 3.6}deg` } as React.CSSProperties}>
          <div><strong>{ratio}%</strong><span>总掌握度</span></div>
        </div>
      </section>

      <section className="metric-grid four">
        <MetricCard icon={<RotateCcw />} label="今日待复习" value={dueCount} detail={dueCount ? '先巩固，再学新内容' : '已全部按时完成'} tone="blue" />
        <MetricCard icon={<BookOpen />} label="推荐新卡" value={Math.max(0, queue.length - dueCount)} detail={`未开始 ${counts.new} 张`} tone="teal" />
        <MetricCard icon={<Flame />} label="连续学习" value={`${streak} 天`} detail={streak >= 3 ? '节奏很好，继续保持' : '从今天建立稳定节奏'} tone="amber" />
        <MetricCard icon={<CheckCircle2 />} label="已掌握" value={counts.mastered} detail={`占全部经验 ${ratio}%`} tone="violet" />
      </section>

      <div className="content-columns dashboard-columns">
        <section className="surface-card queue-panel">
          <SectionHeading title="今日学习队列" description="到期内容优先，推荐新卡不超过每日设置" action={<QuickLegend />} />
          {queue.length ? (
            <div className="study-queue">
              {queue.map((card, index) => {
                const state = getCardState(learning, card.id)
                const due = isDue(state)
                return (
                  <article className="study-row" key={card.id}>
                    <div className={`queue-index ${due ? 'is-due' : 'is-new'}`}>{String(index + 1).padStart(2, '0')}</div>
                    <button className="study-row-main" onClick={() => selectCard(card.id)} type="button">
                      <div className="study-row-title">
                        <span className={due ? 'due-label' : 'fresh-label'}>{due ? '到期复习' : '推荐新卡'}</span>
                        <span>{card.domain}</span>
                      </div>
                      <h3>{card.title}</h3>
                      <div className="study-row-meta"><span>{card.project}</span><ValuePill label="面试" value={card.interviewValue} /></div>
                    </button>
                    <div className="quick-rating" aria-label="快速复习评分">
                      {ratings.map((rating) => (
                        <button
                          key={rating}
                          onClick={() => void applyLearningAction({ type: 'review', cardId: card.id, rating, mode: 'study' })}
                          title={ratingHint[rating]}
                          type="button"
                        >{ratingLabel[rating]}</button>
                      ))}
                    </div>
                    <button className="round-arrow" onClick={() => selectCard(card.id)} title="打开经验卡" type="button"><ChevronRight size={18} /></button>
                  </article>
                )
              })}
            </div>
          ) : (
            <EmptyState icon={<CheckCircle2 />} title="今日任务已完成" description="保持节奏比一次学很多更重要。你也可以进入面试训练巩固表达。" action={<button className="secondary-button" onClick={() => navigate('interview')} type="button">进入面试训练</button>} />
          )}
        </section>

        <aside className="dashboard-rail">
          <section className="surface-card focus-card">
            <SectionHeading title="今日节奏" description={`${todayMinutes}/${learning?.settings.dailyMinutes ?? 20} 分钟`} />
            <ProgressBar value={todayMinutes} max={learning?.settings.dailyMinutes ?? 20} label={`${Math.round((todayMinutes / Math.max(1, learning?.settings.dailyMinutes ?? 20)) * 100)}%`} />
            <div className="study-heat-row">
              {previousDays(learning?.studyDays ?? [], 7).map((day) => <span key={day.key} className={day.active ? 'active' : ''} title={day.key}>{day.label}</span>)}
            </div>
          </section>

          <section className="surface-card weak-card">
            <SectionHeading title="优先补强" description="按掌握率从低到高" action={<button className="text-button" onClick={() => navigate('domains')} type="button">查看全部</button>} />
            <div className="weak-list">
              {weak.map((item) => (
                <button key={item.domain} onClick={() => navigate('domains')} type="button">
                  <span className="domain-avatar">{item.domain.slice(0, 2).toUpperCase()}</span>
                  <span><strong>{item.domain}</strong><small>{item.mastered}/{item.total} 已掌握</small></span>
                  <span className="weak-percent">{Math.round(item.ratio * 100)}%</span>
                </button>
              ))}
            </div>
          </section>

          <section className="surface-card interview-callout">
            <div className="callout-icon"><BrainCircuit size={22} /></div>
            <div><span>求职冲刺</span><strong>用真实案例练出可信回答</strong></div>
            <button onClick={() => navigate('interview')} type="button"><ArrowRight size={18} /></button>
          </section>
        </aside>
      </div>
    </div>
  )
}

export function LibraryView(): React.JSX.Element {
  const snapshot = useAppStore((state) => state.snapshot)
  const learning = useAppStore((state) => state.learning)
  const filters = useAppStore((state) => state.filters)
  const setFilters = useAppStore((state) => state.setFilters)
  const clearFilters = useAppStore((state) => state.clearFilters)
  const selectCard = useAppStore((state) => state.selectCard)
  const [filtersOpen, setFiltersOpen] = useState(true)
  const cards = snapshot?.cards ?? []
  useMemo(() => createKnowledgeSearchIndex(cards), [cards])
  const results = useMemo(() => filterCards(cards, learning, filters), [cards, learning, filters])
  const projects = uniqueValues(cards, (card) => card.project)
  const domains = uniqueValues(cards, (card) => card.domain)
  const verifications = uniqueValues(cards, (card) => card.verification)
  const activeCount = Object.entries(filters).filter(([key, value]) => key !== 'query' && value !== '' && value !== false).length

  return (
    <div className="page library-page">
      <PageIntro eyebrow="KNOWLEDGE LIBRARY" title="经验库" description={`在 ${cards.length} 张真实工程经验中，快速找到值得复习的答案。`} />
      <section className="library-toolbar surface-card">
        <label className="search-box wide">
          <Search size={19} />
          <input
            data-global-search
            onChange={(event) => setFilters({ query: event.target.value })}
            placeholder="搜索问题、根因、方案、项目、标签…（按 / 快速聚焦）"
            type="search"
            value={filters.query}
          />
          {filters.query && <button onClick={() => setFilters({ query: '' })} title="清除搜索" type="button"><X size={17} /></button>}
          <kbd>/</kbd>
        </label>
        <button className={`filter-toggle ${activeCount ? 'active' : ''}`} onClick={() => setFiltersOpen((value) => !value)} type="button">
          <SlidersHorizontal size={18} />筛选{activeCount > 0 && <b>{activeCount}</b>}
        </button>
      </section>

      {filtersOpen && (
        <section className="filter-panel surface-card">
          <div className="filter-field"><label>项目</label><select value={filters.project} onChange={(event) => setFilters({ project: event.target.value })}><option value="">全部项目</option>{projects.map((value) => <option key={value}>{value}</option>)}</select></div>
          <div className="filter-field"><label>技术领域</label><select value={filters.domain} onChange={(event) => setFilters({ domain: event.target.value })}><option value="">全部领域</option>{domains.map((value) => <option key={value}>{value}</option>)}</select></div>
          <div className="filter-field"><label>验证状态</label><select value={filters.verification} onChange={(event) => setFilters({ verification: event.target.value })}><option value="">全部状态</option>{verifications.map((value) => <option key={value}>{value}</option>)}</select></div>
          <div className="filter-field"><label>学习价值</label><select value={filters.learningValue} onChange={(event) => setFilters({ learningValue: event.target.value })}><option value="">不限</option><option value="3">3 分以上</option><option value="4">4 分以上</option><option value="5">满分</option></select></div>
          <div className="filter-field"><label>面试价值</label><select value={filters.interviewValue} onChange={(event) => setFilters({ interviewValue: event.target.value })}><option value="">不限</option><option value="3">3 分以上</option><option value="4">4 分以上</option><option value="5">满分</option></select></div>
          <div className="filter-field"><label>掌握状态</label><select value={filters.mastery} onChange={(event) => setFilters({ mastery: event.target.value })}><option value="">全部</option>{Object.entries(learningStatusLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
          <div className="filter-field date"><label>起始日期</label><input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ dateFrom: event.target.value })} /></div>
          <div className="filter-field date"><label>结束日期</label><input type="date" value={filters.dateTo} onChange={(event) => setFilters({ dateTo: event.target.value })} /></div>
          <label className="favorite-filter"><input type="checkbox" checked={filters.favoriteOnly} onChange={(event) => setFilters({ favoriteOnly: event.target.checked })} /><Heart size={16} />只看收藏</label>
          <button className="clear-filters" onClick={clearFilters} disabled={!activeCount && !filters.query} type="button"><RotateCcw size={15} />重置</button>
        </section>
      )}

      <div className="results-heading">
        <div><strong>{results.length}</strong><span>条结果</span>{filters.query && <span>匹配“{filters.query}”</span>}</div>
        <span className="sort-note"><Filter size={14} />{filters.query ? '按相关度与经验价值排序' : '按经验价值与更新时间排序'}</span>
      </div>

      {results.length ? (
        <section className="knowledge-grid">
          {results.map((card) => <CardTile key={card.id} card={card} state={getCardState(learning, card.id)} query={filters.query} onOpen={() => selectCard(card.id)} />)}
        </section>
      ) : (
        <EmptyState title="没有找到匹配经验" description="试试缩短关键词，或清除部分筛选条件。" action={<button className="secondary-button" onClick={clearFilters} type="button">清除全部筛选</button>} />
      )}
    </div>
  )
}

export function ProjectsView(): React.JSX.Element {
  const snapshot = useAppStore((state) => state.snapshot)
  const learning = useAppStore((state) => state.learning)
  const selectCard = useAppStore((state) => state.selectCard)
  const selectDocument = useAppStore((state) => state.selectDocument)
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const grouped = useMemo(() => groupBy(snapshot?.cards ?? [], (card) => card.project), [snapshot])
    .sort((a, b) => b[1].length - a[1].length)
  const activeName = selectedProject ?? grouped[0]?.[0] ?? ''
  const activeCards = grouped.find(([name]) => name === activeName)?.[1] ?? []
  const docs = docsByKind(snapshot, ['project']).filter((doc) => !activeName || doc.title.includes(activeName) || doc.relativePath.includes(activeName))
  const mastered = activeCards.filter((card) => getCardState(learning, card.id).status === 'mastered').length
  const avgValue = activeCards.length ? (activeCards.reduce((sum, card) => sum + card.experienceScore, 0) / activeCards.length).toFixed(1) : '0'

  return (
    <div className="page projects-page">
      <PageIntro eyebrow="PROJECT STORIES" title="项目专题" description="从项目上下文进入，串起问题、决策、解决方案和结果。" />
      {grouped.length ? (
        <div className="project-layout">
          <aside className="project-sidebar surface-card">
            <div className="side-title"><FolderKanban size={17} />项目列表<span>{grouped.length}</span></div>
            {grouped.map(([name, cards]) => {
              const complete = cards.filter((card) => getCardState(learning, card.id).status === 'mastered').length
              return (
                <button className={name === activeName ? 'active' : ''} key={name} onClick={() => setSelectedProject(name)} type="button">
                  <span className="project-monogram">{name.slice(0, 1).toUpperCase()}</span>
                  <span><strong>{name}</strong><small>{cards.length} 张经验 · {complete} 已掌握</small></span>
                  <ChevronRight size={16} />
                </button>
              )
            })}
          </aside>

          <main className="project-detail">
            <section className="project-banner">
              <div><span className="eyebrow">PROJECT FOCUS</span><h2>{activeName}</h2><p>围绕真实交付沉淀的工程问题与可复用解法。</p></div>
              <div className="project-stats"><div><strong>{activeCards.length}</strong><span>经验卡</span></div><div><strong>{mastered}</strong><span>已掌握</span></div><div><strong>{avgValue}</strong><span>平均价值</span></div></div>
            </section>
            <section className="surface-card project-cards-panel">
              <SectionHeading title="项目经验" description="按价值优先排列" />
              <div className="compact-card-list">
                {[...activeCards].sort((a, b) => b.experienceScore - a.experienceScore).map((card) => (
                  <CardTile key={card.id} compact card={card} state={getCardState(learning, card.id)} onOpen={() => selectCard(card.id)} />
                ))}
              </div>
            </section>
            {docs.length > 0 && (
              <section className="project-docs">
                <SectionHeading title="项目资料" description="索引与项目复盘文档" />
                <div className="document-grid">{docs.map((doc) => <DocumentTile key={doc.id} document={doc} onOpen={() => selectDocument(doc)} />)}</div>
              </section>
            )}
          </main>
        </div>
      ) : <EmptyState icon={<FolderKanban />} title="暂无项目经验" description="连接包含经验卡的知识库后，项目专题会自动建立。" />}
    </div>
  )
}

const domainColors = ['blue', 'teal', 'violet', 'amber', 'rose', 'cyan']

export function DomainsView(): React.JSX.Element {
  const snapshot = useAppStore((state) => state.snapshot)
  const learning = useAppStore((state) => state.learning)
  const selectCard = useAppStore((state) => state.selectCard)
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null)
  const grouped = useMemo(() => groupBy(snapshot?.cards ?? [], (card) => card.domain).sort((a, b) => b[1].length - a[1].length), [snapshot])
  const cards = selectedDomain ? grouped.find(([domain]) => domain === selectedDomain)?.[1] ?? [] : []

  return (
    <div className="page domains-page">
      <PageIntro eyebrow="TECH DOMAINS" title="技术领域" description="从能力地图看见优势，也看见下一步最值得补强的地方。" />
      <section className="domain-overview">
        {grouped.map(([domain, domainCards], index) => {
          const mastered = domainCards.filter((card) => getCardState(learning, card.id).status === 'mastered').length
          const ratio = Math.round((mastered / domainCards.length) * 100)
          const avgInterview = (domainCards.reduce((sum, card) => sum + card.interviewValue, 0) / domainCards.length).toFixed(1)
          return (
            <button className={`domain-card color-${domainColors[index % domainColors.length]} ${selectedDomain === domain ? 'active' : ''}`} key={domain} onClick={() => setSelectedDomain(selectedDomain === domain ? null : domain)} type="button">
              <div className="domain-card-head"><span><Layers3 size={20} /></span><small>{domainCards.length} 张</small></div>
              <h3>{domain}</h3>
              <div className="domain-figures"><span><b>{ratio}%</b>掌握度</span><span><b>{avgInterview}</b>面试价值</span></div>
              <ProgressBar value={ratio} />
              <div className="domain-card-foot"><span>{mastered} 张已掌握</span><span>查看专题 <ChevronRight size={14} /></span></div>
            </button>
          )
        })}
      </section>

      {selectedDomain && (
        <section className="surface-card domain-drawer">
          <SectionHeading title={`${selectedDomain} · 经验清单`} description={`${cards.length} 张经验，优先复习未掌握且面试价值高的内容`} action={<button className="icon-button" onClick={() => setSelectedDomain(null)} title="关闭" type="button"><X size={18} /></button>} />
          <div className="domain-list">
            {[...cards].sort((a, b) => {
              const stateA = getCardState(learning, a.id)
              const stateB = getCardState(learning, b.id)
              return Number(stateA.status === 'mastered') - Number(stateB.status === 'mastered') || b.interviewValue - a.interviewValue
            }).map((card) => {
              const state = getCardState(learning, card.id)
              return (
                <button key={card.id} onClick={() => selectCard(card.id)} type="button">
                  <span className="domain-list-status">{state.status === 'mastered' ? <CheckCircle2 size={18} /> : <CircleDot size={18} />}</span>
                  <span className="domain-list-main"><small>{card.id} · {card.project}</small><strong>{card.title}</strong></span>
                  <StateBadge state={state} />
                  <span className="domain-list-score"><Star size={14} fill="currentColor" />{card.interviewValue}</span>
                  <ChevronRight size={17} />
                </button>
              )
            })}
          </div>
        </section>
      )}

      {!grouped.length && <EmptyState icon={<Layers3 />} title="暂无技术领域" description="知识库中的领域元数据会自动汇总在这里。" />}
    </div>
  )
}

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了，学一点就好'
  if (hour < 11) return '早上好，开始今天的积累'
  if (hour < 14) return '中午好，用片刻巩固经验'
  if (hour < 18) return '下午好，把经历变成能力'
  return '晚上好，完成今天的复盘'
}
