import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookCheck,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileArchive,
  FileText,
  Flame,
  FolderCheck,
  FolderOpen,
  Heart,
  Info,
  Laptop,
  Maximize2,
  MessageSquareText,
  Moon,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  TimerReset,
  Trophy,
  Upload,
  Zap
} from 'lucide-react'
import type { AppSettings, KnowledgeCard, ReviewRating, ThemeMode } from '@shared/types'
import {
  calculateStreak,
  completionRatio,
  daysUntil,
  docsByKind,
  extractInterviewMaterial,
  formatDate,
  formatDateTime,
  getCardState,
  interviewCards,
  masteryCounts,
  previousDays,
  ratingHint,
  ratingLabel,
  sprintPlan,
  uniqueValues,
  weakDomains
} from './lib'
import {
  DiagnosticList,
  DocumentTile,
  EmptyState,
  MarkdownView,
  MetricCard,
  PageIntro,
  ProgressBar,
  SectionHeading,
  ValuePill
} from './components'
import { useAppStore } from './store'

const reviewRatings: ReviewRating[] = ['again', 'hard', 'good', 'easy']

function useTimer(initialSeconds: number): {
  seconds: number
  running: boolean
  reset: (value?: number) => void
  toggle: () => void
} {
  const [seconds, setSeconds] = useState(initialSeconds)
  const [running, setRunning] = useState(false)
  useEffect(() => {
    if (!running || seconds <= 0) return
    const timer = setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000)
    return () => clearInterval(timer)
  }, [running, seconds])
  useEffect(() => {
    if (seconds === 0) setRunning(false)
  }, [seconds])
  return {
    seconds,
    running,
    reset: (value = initialSeconds) => {
      setSeconds(value)
      setRunning(false)
    },
    toggle: () => setRunning((value) => !value)
  }
}

function TimerDisplay({ seconds, total }: { seconds: number; total: number }): React.JSX.Element {
  return (
    <div className={`timer-display ${seconds <= 5 ? 'ending' : ''}`} style={{ '--timer-progress': `${(seconds / total) * 100}%` } as React.CSSProperties}>
      <span>{String(Math.floor(seconds / 60)).padStart(2, '0')}</span><i>:</i><span>{String(seconds % 60).padStart(2, '0')}</span>
    </div>
  )
}

export function InterviewView(): React.JSX.Element {
  const snapshot = useAppStore((state) => state.snapshot)
  const learning = useAppStore((state) => state.learning)
  const applyLearningAction = useAppStore((state) => state.applyLearningAction)
  const selectDocument = useAppStore((state) => state.selectDocument)
  const cards = useMemo(() => interviewCards(snapshot), [snapshot])
  const [selectedId, setSelectedId] = useState<string>('')
  const [query, setQuery] = useState('')
  const [answerMode, setAnswerMode] = useState<30 | 120>(30)
  const [reveal, setReveal] = useState(0)
  const [tab, setTab] = useState<'practice' | 'plan' | 'docs'>('practice')
  const timer = useTimer(answerMode)
  const selected = cards.find((card) => card.id === selectedId) ?? cards[0]
  const material = selected ? extractInterviewMaterial(selected) : null
  const plan = sprintPlan(snapshot, learning)
  const docs = docsByKind(snapshot, ['interview'])
  const filteredCards = cards.filter((card) => [card.title, card.project, card.domain].join(' ').toLocaleLowerCase('zh-CN').includes(query.trim().toLocaleLowerCase('zh-CN')))

  useEffect(() => {
    setReveal(0)
    timer.reset(answerMode)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, answerMode])

  const nextCard = (): void => {
    if (!selected || !cards.length) return
    const index = cards.findIndex((card) => card.id === selected.id)
    setSelectedId(cards[(index + 1) % cards.length].id)
  }

  return (
    <div className="page interview-page">
      <PageIntro
        eyebrow="INTERVIEW PRACTICE"
        title="面试训练"
        description="不背空话，用真实问题、行动与验证练出有说服力的回答。"
        actions={<div className="segment-control"><button className={tab === 'practice' ? 'active' : ''} onClick={() => setTab('practice')} type="button">模拟训练</button><button className={tab === 'plan' ? 'active' : ''} onClick={() => setTab('plan')} type="button">14 天冲刺</button><button className={tab === 'docs' ? 'active' : ''} onClick={() => setTab('docs')} type="button">面试资料</button></div>}
      />

      {tab === 'practice' && (selected && material ? (
        <div className="interview-layout">
          <aside className="interview-sidebar surface-card">
            <div className="side-title"><MessageSquareText size={17} />候选案例<span>{cards.length}</span></div>
            <label className="mini-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选案例" /></label>
            <div className="interview-card-list">
              {filteredCards.map((card) => {
                const state = getCardState(learning, card.id)
                return (
                  <button className={card.id === selected.id ? 'active' : ''} key={card.id} onClick={() => setSelectedId(card.id)} type="button">
                    <span className="case-value">{card.interviewValue}</span>
                    <span><small>{card.domain} · {card.project}</small><strong>{card.title}</strong></span>
                    {state.reviewCount > 0 && <CheckCircle2 size={15} />}
                  </button>
                )
              })}
            </div>
          </aside>

          <main className="practice-stage">
            <section className="question-card">
              <div className="question-meta"><span>{selected.domain}</span><span>{selected.project}</span><ValuePill label="面试" value={selected.interviewValue} /></div>
              <span className="question-kicker">INTERVIEW QUESTION</span>
              <h2>{material.question}</h2>
              <div className="timer-controls">
                <div className="time-mode"><button className={answerMode === 30 ? 'active' : ''} onClick={() => setAnswerMode(30)} type="button">30 秒精答</button><button className={answerMode === 120 ? 'active' : ''} onClick={() => setAnswerMode(120)} type="button">2 分钟展开</button></div>
                <TimerDisplay seconds={timer.seconds} total={answerMode} />
                <button className={`timer-play ${timer.running ? 'active' : ''}`} onClick={timer.toggle} type="button">{timer.running ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}{timer.running ? '暂停' : '开始计时'}</button>
                <button className="icon-button" onClick={() => timer.reset(answerMode)} title="重置计时" type="button"><TimerReset size={18} /></button>
              </div>
            </section>

            <section className="answer-stage surface-card">
              <div className="answer-stage-title">
                <div><BrainCircuit size={20} /><span><strong>参考回答</strong><small>先自己说，再逐步揭示</small></span></div>
                <button className="reveal-button" onClick={() => setReveal((value) => Math.min(3, value + 1))} disabled={reveal >= 3} type="button">{reveal ? <Eye size={17} /> : <EyeOff size={17} />}{reveal === 0 ? '揭示 30 秒回答' : reveal === 1 ? '继续揭示完整结构' : reveal === 2 ? '查看追问' : '已全部揭示'}</button>
              </div>

              {reveal === 0 ? (
                <div className="hidden-answer"><div><EyeOff size={30} /><strong>答案已隐藏</strong><span>请先用自己的语言回答，完成后再查看参考结构。</span></div></div>
              ) : (
                <div className="answer-sections">
                  <section className="answer-section short-answer"><span className="answer-number">01</span><div><h3>30 秒回答</h3><MarkdownView markdown={material.shortAnswer} /></div></section>
                  {reveal >= 2 && <section className="answer-section long-answer"><span className="answer-number">02</span><div><h3>2 分钟展开</h3><MarkdownView markdown={material.longAnswer} /></div></section>}
                  {reveal >= 3 && <section className="answer-section follow-up"><span className="answer-number">03</span><div><h3>可能追问</h3><MarkdownView markdown={material.followUps} /></div></section>}
                </div>
              )}
            </section>

            <section className="self-rating surface-card">
              <div><span className="eyebrow">SELF ASSESSMENT</span><h3>这次回答得怎么样？</h3><p>诚实评分会决定下一次复习时间。</p></div>
              <div className="rating-buttons">
                {reviewRatings.map((rating) => (
                  <button className={`rating-${rating}`} key={rating} onClick={() => { void applyLearningAction({ type: 'review', cardId: selected.id, rating, mode: 'interview' }); nextCard() }} type="button">
                    <strong>{ratingLabel[rating]}</strong><span>{ratingHint[rating]}</span>
                  </button>
                ))}
              </div>
              <button className="next-case" onClick={nextCard} type="button">跳过并换一题<ArrowRight size={16} /></button>
            </section>
          </main>
        </div>
      ) : <EmptyState icon={<BrainCircuit />} title="暂无面试案例" description="当经验卡包含面试提炼或面试价值时，会自动进入训练列表。" />)}

      {tab === 'plan' && <SprintPlan plan={plan} cards={cards} />}

      {tab === 'docs' && (
        <section>
          <SectionHeading title="面试资料库" description="候选案例索引、月度提炼和其他面试准备材料" />
          {docs.length ? <div className="document-grid">{docs.map((doc) => <DocumentTile key={doc.id} document={doc} onOpen={() => selectDocument(doc)} />)}</div> : <EmptyState icon={<FileText />} title="暂无面试资料" description="知识库中的面试文档会自动显示在这里。" />}
        </section>
      )}
    </div>
  )
}

function SprintPlan({ plan, cards }: { plan: ReturnType<typeof sprintPlan>; cards: KnowledgeCard[] }): React.JSX.Element {
  const selectCard = useAppStore((state) => state.selectCard)
  const complete = plan.filter((day) => day.complete).length
  return (
    <div className="sprint-wrap">
      <section className="sprint-hero">
        <div><span className="hero-kicker"><Zap size={15} />求职前集中强化</span><h2>14 天面试冲刺计划</h2><p>每天围绕一个薄弱领域，练习 2 个高面试价值真实案例。</p></div>
        <div className="sprint-progress"><strong>{complete}<small>/14</small></strong><span>已完成天数</span><ProgressBar value={complete} max={14} /></div>
      </section>
      <section className="sprint-grid">
        {plan.map((day) => {
          const dayCards = day.cardIds.map((id) => cards.find((card) => card.id === id)).filter((card): card is KnowledgeCard => Boolean(card))
          return (
            <article className={`sprint-day ${day.complete ? 'complete' : ''} ${day.day === 1 ? 'today' : ''}`} key={day.day}>
              <div className="sprint-day-head"><span>DAY {String(day.day).padStart(2, '0')}</span>{day.complete ? <CheckCircle2 size={17} /> : <span>{formatDate(day.date, false)}</span>}</div>
              <h3>{day.theme}</h3>
              <div className="sprint-cases">
                {dayCards.map((card) => <button key={card.id} onClick={() => selectCard(card.id)} type="button"><span>{card.id}</span>{card.title}<ChevronRight size={14} /></button>)}
                {!dayCards.length && <span className="no-case">待知识库补充相关案例</span>}
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}

export function ProgressView(): React.JSX.Element {
  const snapshot = useAppStore((state) => state.snapshot)
  const learning = useAppStore((state) => state.learning)
  const navigate = useAppStore((state) => state.navigate)
  const counts = masteryCounts(snapshot, learning)
  const ratio = completionRatio(snapshot, learning)
  const streak = calculateStreak(learning?.studyDays ?? [])
  const weak = weakDomains(snapshot, learning)
  const reviews = learning?.reviews ?? []
  const recentReviews = reviews.filter((review) => new Date(review.reviewedAt).getTime() > Date.now() - 7 * 86_400_000).length
  const favorites = Object.values(learning?.cards ?? {}).filter((state) => state.favorite).length
  const total = snapshot?.cards.length ?? 0

  return (
    <div className="page progress-page">
      <PageIntro eyebrow="LEARNING INSIGHTS" title="学习进度" description="把努力变成清晰可见的掌握度与下一步行动。" actions={<button className="secondary-button" onClick={() => navigate('today')} type="button"><BookOpen size={16} />继续今日学习</button>} />
      <section className="metric-grid four">
        <MetricCard icon={<Trophy />} label="总体掌握度" value={`${ratio}%`} detail={`${counts.mastered}/${total} 张已掌握`} tone="violet" />
        <MetricCard icon={<Flame />} label="连续学习" value={`${streak} 天`} detail={`累计学习 ${learning?.studyDays.length ?? 0} 天`} tone="amber" />
        <MetricCard icon={<RotateCcw />} label="本周复习" value={recentReviews} detail={`累计完成 ${reviews.length} 次复习`} tone="blue" />
        <MetricCard icon={<Heart />} label="收藏案例" value={favorites} detail="建立自己的重点题库" tone="teal" />
      </section>

      <div className="progress-columns">
        <section className="surface-card mastery-panel">
          <SectionHeading title="掌握状态" description="全部经验卡的学习分布" />
          <div className="mastery-chart-wrap">
            <div className="mastery-donut" style={{ '--mastery': `${ratio * 3.6}deg` } as React.CSSProperties}><div><strong>{ratio}%</strong><span>已掌握</span></div></div>
            <div className="mastery-legend">
              {Object.entries(counts).map(([status, count]) => (
                <div key={status}><span className={`status-color color-${status}`} /><span>{learningStatusText(status)}</span><strong>{count}</strong><small>{total ? Math.round((count / total) * 100) : 0}%</small></div>
              ))}
            </div>
          </div>
        </section>

        <section className="surface-card activity-panel">
          <SectionHeading title="学习活跃度" description="最近 8 周" action={<span className="streak-pill"><Flame size={14} />连续 {streak} 天</span>} />
          <div className="activity-heatmap">
            {previousDays(learning?.studyDays ?? [], 56).map((day) => <span className={day.active ? 'active' : ''} key={day.key} title={`${day.key}${day.active ? ' · 有学习记录' : ''}`} />)}
          </div>
          <div className="heatmap-caption"><span>8 周前</span><span>今天</span></div>
          <div className="activity-note"><Sparkles size={18} /><span><strong>{streak >= 7 ? '稳定的节奏正在形成' : '从连续 7 天开始建立习惯'}</strong><small>每天 20 分钟，比突击式学习更容易形成长期记忆。</small></span></div>
        </section>
      </div>

      <section className="surface-card domain-progress-panel">
        <SectionHeading title="领域掌握情况" description="优先关注掌握率低、经验数量多的方向" />
        <div className="domain-progress-list">
          {weak.map((item) => (
            <div key={item.domain}>
              <span className="domain-avatar">{item.domain.slice(0, 2).toUpperCase()}</span>
              <span className="domain-progress-name"><strong>{item.domain}</strong><small>{item.mastered}/{item.total} 张已掌握 · 平均信心 {item.confidence.toFixed(1)}/5</small></span>
              <ProgressBar value={item.ratio * 100} />
              <strong className="domain-progress-value">{Math.round(item.ratio * 100)}%</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function learningStatusText(status: string): string {
  return { new: '未开始', learning: '学习中', reviewing: '待复习', mastered: '已掌握' }[status] ?? status
}

type DocumentTab = 'all' | 'project' | 'interview' | 'review' | 'learning'

export function ReviewsView(): React.JSX.Element {
  const snapshot = useAppStore((state) => state.snapshot)
  const selectDocument = useAppStore((state) => state.selectDocument)
  const [tab, setTab] = useState<DocumentTab>('all')
  const [query, setQuery] = useState('')
  const docs = useMemo(() => docsByKind(snapshot, tab === 'all' ? ['project', 'interview', 'review', 'learning'] : [tab]), [snapshot, tab])
    .filter((doc) => [doc.title, doc.plainText, doc.relativePath].join(' ').toLocaleLowerCase('zh-CN').includes(query.trim().toLocaleLowerCase('zh-CN')))
  const counts = useMemo(() => {
    const result = { all: snapshot?.documents.length ?? 0, project: 0, interview: 0, review: 0, learning: 0 }
    for (const doc of snapshot?.documents ?? []) result[doc.kind] += 1
    return result
  }, [snapshot])

  return (
    <div className="page reviews-page">
      <PageIntro eyebrow="REVIEWS & NOTES" title="阶段复盘" description="在更高视角上回看项目、面试材料与下一阶段学习方向。" />
      <section className="docs-toolbar surface-card">
        <div className="document-tabs">
          {([
            ['all', '全部'], ['project', '项目索引'], ['interview', '面试材料'], ['review', '阶段复盘'], ['learning', '待学习']
          ] as Array<[DocumentTab, string]>).map(([value, label]) => <button className={tab === value ? 'active' : ''} onClick={() => setTab(value)} key={value} type="button">{label}<span>{counts[value]}</span></button>)}
        </div>
        <label className="mini-search docs-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文档内容" /></label>
      </section>
      {docs.length ? <section className="document-grid large">{docs.map((doc) => <DocumentTile key={doc.id} document={doc} onOpen={() => selectDocument(doc)} />)}</section> : <EmptyState icon={<FileArchive />} title="没有匹配文档" description="切换分类或尝试其他关键词。" />}
    </div>
  )
}

export function SettingsView(): React.JSX.Element {
  const snapshot = useAppStore((state) => state.snapshot)
  const resolution = useAppStore((state) => state.resolution)
  const learning = useAppStore((state) => state.learning)
  const refreshing = useAppStore((state) => state.refreshing)
  const chooseRoot = useAppStore((state) => state.chooseRoot)
  const refresh = useAppStore((state) => state.refresh)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const exportState = useAppStore((state) => state.exportState)
  const importState = useAppStore((state) => state.importState)
  const settings = learning?.settings
  if (!settings) return <EmptyState title="正在读取设置" description="请稍候…" />
  const projects = uniqueValues(snapshot?.cards ?? [], (card) => card.project)
  const domains = uniqueValues(snapshot?.cards ?? [], (card) => card.domain)

  const toggleFocus = (key: 'focusProjects' | 'focusDomains', value: string): void => {
    const current = settings[key]
    void updateSettings({ [key]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] })
  }

  return (
    <div className="page settings-page">
      <PageIntro eyebrow="PREFERENCES" title="设置" description="让学习节奏和阅读体验更适合你。" />
      <div className="settings-layout">
        <main className="settings-main">
          <section className="settings-section surface-card">
            <div className="settings-section-head"><span className="settings-icon blue"><FolderOpen size={19} /></span><div><h2>知识库</h2><p>学习中心只读访问知识内容，不会修改经验卡。</p></div></div>
            <div className={`root-status ${resolution?.valid ? 'valid' : 'invalid'}`}>
              <span>{resolution?.valid ? <FolderCheck size={20} /> : <AlertTriangle size={20} />}</span>
              <div><strong>{resolution?.valid ? '知识库已连接' : '知识库未连接'}</strong><code title={snapshot?.root || resolution?.message}>{snapshot?.root || resolution?.message || '请选择知识库目录'}</code></div>
              <span className="root-source">{resolution?.source ?? 'none'}</span>
            </div>
            <div className="button-row"><button className="secondary-button" onClick={() => void chooseRoot()} type="button"><FolderOpen size={16} />更换目录</button><button className="secondary-button" disabled={refreshing || !resolution?.valid} onClick={() => void refresh()} type="button"><RefreshCw className={refreshing ? 'spin' : ''} size={16} />{refreshing ? '正在刷新' : '立即刷新'}</button></div>
            <div className="kb-stat-strip"><span><strong>{snapshot?.stats.cardCount ?? 0}</strong>经验卡</span><span><strong>{snapshot?.stats.projectCount ?? 0}</strong>项目</span><span><strong>{snapshot?.stats.domainCount ?? 0}</strong>领域</span><span><strong>{snapshot?.stats.documentCount ?? 0}</strong>文档</span><small>扫描于 {formatDateTime(snapshot?.scannedAt)}</small></div>
          </section>

          <section className="settings-section surface-card">
            <div className="settings-section-head"><span className="settings-icon violet"><BookCheck size={19} /></span><div><h2>学习计划</h2><p>这些设置会影响今日推荐与求职冲刺排序。</p></div></div>
            <div className="settings-grid two">
              <label className="setting-field"><span>每日学习时长</span><div className="input-suffix"><input min="5" max="120" step="5" type="number" value={settings.dailyMinutes} onChange={(event) => void updateSettings({ dailyMinutes: Number(event.target.value) })} /><span>分钟</span></div></label>
              <label className="setting-field"><span>每日新卡数量</span><div className="input-suffix"><input min="0" max="10" type="number" value={settings.dailyNewCards} onChange={(event) => void updateSettings({ dailyNewCards: Number(event.target.value) })} /><span>张</span></div></label>
              <label className="setting-field"><span>目标面试日期</span><input type="date" value={settings.interviewDate ?? ''} onChange={(event) => void updateSettings({ interviewDate: event.target.value || null })} /><small>{daysUntil(settings.interviewDate) === null ? '未设置目标日期' : `还有 ${Math.max(0, daysUntil(settings.interviewDate) ?? 0)} 天`}</small></label>
            </div>
            <FocusPicker title="重点项目" values={projects} selected={settings.focusProjects} onToggle={(value) => toggleFocus('focusProjects', value)} />
            <FocusPicker title="重点技术领域" values={domains} selected={settings.focusDomains} onToggle={(value) => toggleFocus('focusDomains', value)} />
          </section>

          <section className="settings-section surface-card">
            <div className="settings-section-head"><span className="settings-icon teal"><Laptop size={19} /></span><div><h2>显示与阅读</h2><p>针对长文阅读、宽屏和 Windows 缩放优化。</p></div></div>
            <div className="theme-options">
              {([['light', <Sun size={18} />, '亮色'], ['dark', <Moon size={18} />, '暗色'], ['system', <Laptop size={18} />, '跟随系统']] as Array<[ThemeMode, React.ReactNode, string]>).map(([value, icon, label]) => (
                <button className={settings.theme === value ? 'active' : ''} onClick={() => void updateSettings({ theme: value })} key={value} type="button">{icon}<span>{label}</span>{settings.theme === value && <Check size={16} />}</button>
              ))}
            </div>
            <label className="range-setting"><span><strong>正文字号</strong><small>{Math.round(settings.fontScale * 100)}%</small></span><input type="range" min="0.9" max="1.3" step="0.05" value={settings.fontScale} onChange={(event) => void updateSettings({ fontScale: Number(event.target.value) })} /></label>
            <label className="switch-row"><span><Maximize2 size={18} /><span><strong>宽屏阅读模式</strong><small>在大屏上扩大正文阅读区域</small></span></span><input type="checkbox" checked={settings.wideReading} onChange={(event) => void updateSettings({ wideReading: event.target.checked })} /><i /></label>
          </section>

          <section className="settings-section surface-card">
            <div className="settings-section-head"><span className="settings-icon amber"><FileArchive size={19} /></span><div><h2>学习数据</h2><p>导出或恢复收藏、笔记、掌握度与复习历史。</p></div></div>
            <div className="data-actions"><button className="secondary-button" onClick={() => void exportState()} type="button"><Download size={16} />导出学习数据</button><button className="secondary-button" onClick={() => void importState()} type="button"><Upload size={16} />导入学习数据</button></div>
            <div className="privacy-note"><ShieldCheck size={18} /><span><strong>数据始终保存在本机</strong><small>应用不接入网络服务，不需要 API Key，也不会上传知识库内容。</small></span></div>
          </section>
        </main>

        <aside className="settings-aside">
          <section className="surface-card diagnostic-panel"><SectionHeading title="数据诊断" description={`${snapshot?.diagnostics.length ?? 0} 个提示`} /><DiagnosticList diagnostics={snapshot?.diagnostics ?? []} /></section>
          <section className="surface-card app-info"><div className="brand-mark small"><BrainCircuit size={20} /></div><h3>工程经验求职学习中心</h3><span>Version 1.0.0 · Offline</span><p>让每一次真实工程经历，都成为下一次面试的底气。</p></section>
        </aside>
      </div>
    </div>
  )
}

function FocusPicker({ title, values, selected, onToggle }: { title: string; values: string[]; selected: string[]; onToggle: (value: string) => void }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? values : values.slice(0, 8)
  return (
    <div className="focus-picker">
      <div><strong>{title}</strong><span>已选 {selected.length}</span></div>
      <div className="focus-chips">
        {visible.map((value) => <button className={selected.includes(value) ? 'active' : ''} key={value} onClick={() => onToggle(value)} type="button">{selected.includes(value) && <Check size={13} />}{value}</button>)}
        {values.length > 8 && <button className="more-chip" onClick={() => setExpanded((value) => !value)} type="button">{expanded ? '收起' : `其余 ${values.length - 8} 项`}</button>}
      </div>
    </div>
  )
}

export function Onboarding(): React.JSX.Element | null {
  const snapshot = useAppStore((state) => state.snapshot)
  const learning = useAppStore((state) => state.learning)
  const resolution = useAppStore((state) => state.resolution)
  const chooseRoot = useAppStore((state) => state.chooseRoot)
  const completeOnboarding = useAppStore((state) => state.completeOnboarding)
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Partial<AppSettings>>({})
  const initialized = useRef(false)

  useEffect(() => {
    if (!learning || initialized.current) return
    initialized.current = true
    setDraft({
      knowledgeRoot: learning.settings.knowledgeRoot,
      focusProjects: learning.settings.focusProjects,
      focusDomains: learning.settings.focusDomains,
      interviewDate: learning.settings.interviewDate,
      dailyMinutes: learning.settings.dailyMinutes || 20,
      dailyNewCards: learning.settings.dailyNewCards || 3
    })
  }, [learning])

  if (!learning || learning.settings.onboardingCompleted) return null
  const projects = uniqueValues(snapshot?.cards ?? [], (card) => card.project)
  const domains = uniqueValues(snapshot?.cards ?? [], (card) => card.domain)
  const toggle = (key: 'focusProjects' | 'focusDomains', value: string): void => {
    const current = draft[key] ?? []
    setDraft({ ...draft, [key]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] })
  }

  const steps = [
    { title: '连接你的工程经验库', subtitle: '学习中心以只读方式加载内容，不会修改任何经验卡。' },
    { title: '选择求职重点', subtitle: '我们会优先推荐与你目标最相关的项目和技术领域。' },
    { title: '设定学习节奏', subtitle: '每天一点点，让真实经历变成稳定、清晰的表达。' }
  ]

  return (
    <div className="onboarding-backdrop">
      <section className="onboarding-card" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <aside className="onboarding-aside">
          <div className="brand-lockup"><span className="brand-mark"><BrainCircuit size={23} /></span><span><strong>工程经验</strong><small>求职学习中心</small></span></div>
          <div className="onboarding-message"><span>FROM EXPERIENCE<br />TO CONFIDENCE.</span><h2>把做过的事，<br />变成说得清的能力。</h2><p>完全离线 · 本地只读 · 专注求职准备</p></div>
          <div className="onboarding-security"><ShieldCheck size={18} /><span><strong>隐私优先</strong><small>内容不会离开你的电脑</small></span></div>
        </aside>

        <main className="onboarding-main">
          <div className="onboarding-steps">{steps.map((item, index) => <span className={index <= step ? 'active' : ''} key={item.title}><i>{index < step ? <Check size={13} /> : index + 1}</i><b /></span>)}</div>
          <header><span className="eyebrow">STEP {step + 1} OF 3</span><h1 id="onboarding-title">{steps[step].title}</h1><p>{steps[step].subtitle}</p></header>

          {step === 0 && (
            <div className="onboarding-content root-step">
              <div className={`root-preview ${resolution?.valid ? 'valid' : ''}`}><span>{resolution?.valid ? <FolderCheck size={27} /> : <FolderOpen size={27} />}</span><div><small>{resolution?.valid ? '已自动发现知识库' : '尚未发现知识库'}</small><strong>{snapshot?.root || resolution?.root || '请选择目录'}</strong><p>{resolution?.message}</p></div>{resolution?.valid && <CheckCircle2 size={21} />}</div>
              <button className="secondary-button" onClick={async () => { const result = await chooseRoot(); if (result?.valid) setDraft({ ...draft, knowledgeRoot: result.root }) }} type="button"><FolderOpen size={16} />手动选择知识库</button>
              {resolution?.valid && <div className="onboarding-kb-stats"><span><strong>{snapshot?.stats.cardCount ?? 0}</strong>张经验卡</span><span><strong>{snapshot?.stats.projectCount ?? 0}</strong>个项目</span><span><strong>{snapshot?.stats.domainCount ?? 0}</strong>个领域</span></div>}
            </div>
          )}

          {step === 1 && (
            <div className="onboarding-content focus-step">
              <span className="selection-label"><FolderCheck size={16} />重点项目 <small>可多选</small></span>
              <div className="onboarding-options">{projects.map((value) => <button className={(draft.focusProjects ?? []).includes(value) ? 'active' : ''} key={value} onClick={() => toggle('focusProjects', value)} type="button"><span>{value.slice(0, 1).toUpperCase()}</span>{value}{(draft.focusProjects ?? []).includes(value) && <Check size={15} />}</button>)}</div>
              <span className="selection-label"><Target size={16} />重点技术领域 <small>可多选</small></span>
              <div className="onboarding-options compact">{domains.map((value) => <button className={(draft.focusDomains ?? []).includes(value) ? 'active' : ''} key={value} onClick={() => toggle('focusDomains', value)} type="button">{value}{(draft.focusDomains ?? []).includes(value) && <Check size={15} />}</button>)}</div>
              {!projects.length && <p className="inline-warning"><Info size={16} />当前没有可选项目，可在连接知识库后从设置中补充。</p>}
            </div>
          )}

          {step === 2 && (
            <div className="onboarding-content rhythm-step">
              <label><span><CalendarDays size={18} />目标面试日期</span><input type="date" value={draft.interviewDate ?? ''} onChange={(event) => setDraft({ ...draft, interviewDate: event.target.value || null })} /><small>可选，设置后会生成倒计时与冲刺节奏</small></label>
              <div className="minutes-setting"><span><Clock3 size={18} />每天学习多久？</span><div>{[10, 20, 30, 45].map((minutes) => <button className={draft.dailyMinutes === minutes ? 'active' : ''} key={minutes} onClick={() => setDraft({ ...draft, dailyMinutes: minutes })} type="button"><strong>{minutes}</strong><small>分钟</small>{minutes === 20 && <i>推荐</i>}</button>)}</div></div>
              <div className="rhythm-summary"><Sparkles size={20} /><span><strong>你的默认学习计划</strong><small>每天 {draft.dailyMinutes ?? 20} 分钟 · 最多 3 张新卡 · 到期复习优先</small></span></div>
            </div>
          )}

          <footer>
            <button className="text-button" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))} type="button"><ArrowLeft size={16} />上一步</button>
            {step < 2 ? <button className="primary-button" disabled={step === 0 && !resolution?.valid} onClick={() => setStep((value) => value + 1)} type="button">下一步<ArrowRight size={16} /></button> : <button className="primary-button" onClick={() => void completeOnboarding(draft)} type="button"><Sparkles size={17} />进入学习中心</button>}
          </footer>
        </main>
      </section>
    </div>
  )
}
