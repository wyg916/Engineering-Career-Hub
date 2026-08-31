import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  FileText,
  FolderOpen,
  Heart,
  Lightbulb,
  MessageSquareText,
  PanelRightClose,
  SearchX,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  X
} from 'lucide-react'
import type {
  CardLearningState,
  KnowledgeCard,
  KnowledgeDocument,
  KnowledgeSection,
  LearningAction,
  LearningStatus
} from '@shared/types'
import { formatDate, learningStatusLabel } from './lib'

export function PageIntro({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }): React.JSX.Element {
  return (
    <header className="page-intro">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export function SectionHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }): React.JSX.Element {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function MetricCard({ icon, label, value, detail, tone = 'blue' }: { icon: ReactNode; label: string; value: ReactNode; detail: string; tone?: 'blue' | 'teal' | 'amber' | 'violet' }): React.JSX.Element {
  return (
    <article className={`metric-card tone-${tone}`}>
      <div className="metric-icon">{icon}</div>
      <div className="metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  )
}

export function ProgressBar({ value, max = 100, label }: { value: number; max?: number; label?: string }): React.JSX.Element {
  const percentage = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className="progress-wrap" aria-label={label ?? `进度 ${Math.round(percentage)}%`}>
      <div className="progress-track">
        <span style={{ width: `${percentage}%` }} />
      </div>
      {label && <span className="progress-label">{label}</span>}
    </div>
  )
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }): React.JSX.Element {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon ?? <SearchX size={24} />}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}

export function Highlight({ text, query }: { text: string; query: string }): React.JSX.Element {
  const normalized = query.trim()
  if (!normalized) return <>{text}</>
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pieces = text.split(new RegExp(`(${escaped})`, 'gi'))
  return (
    <>
      {pieces.map((piece, index) =>
        piece.toLocaleLowerCase('zh-CN') === normalized.toLocaleLowerCase('zh-CN') ? <mark key={`${piece}-${index}`}>{piece}</mark> : piece
      )}
    </>
  )
}

export function ValuePill({ label, value, max = 5 }: { label: string; value: number; max?: number }): React.JSX.Element {
  return (
    <span className="value-pill" title={`${label} ${value}/${max}`}>
      {label}<b>{value}</b>
    </span>
  )
}

export function StateBadge({ state }: { state: CardLearningState }): React.JSX.Element {
  return <span className={`state-badge state-${state.status}`}>{learningStatusLabel[state.status]}</span>
}

export function CardTile({
  card,
  state,
  query = '',
  compact = false,
  onOpen
}: {
  card: KnowledgeCard
  state: CardLearningState
  query?: string
  compact?: boolean
  onOpen: () => void
}): React.JSX.Element {
  return (
    <button className={`knowledge-tile ${compact ? 'compact' : ''}`} onClick={onOpen} type="button">
      <div className="tile-topline">
        <span className="tile-id">{card.id}</span>
        <div className="tile-flags">
          {state.favorite && <Heart size={14} fill="currentColor" aria-label="已收藏" />}
          <StateBadge state={state} />
        </div>
      </div>
      <h3><Highlight text={card.title} query={query} /></h3>
      {!compact && <p>{card.plainText.slice(0, 116).replace(/\s+/g, ' ')}{card.plainText.length > 116 ? '…' : ''}</p>}
      <div className="tile-meta">
        <span>{card.project || '未分类项目'}</span>
        <span>{card.domain || '其他'}</span>
      </div>
      <div className="tile-footer">
        <div className="tag-row">
          {card.tags.slice(0, compact ? 1 : 3).map((tag) => <span className="mini-tag" key={tag}>{tag}</span>)}
        </div>
        <span className="tile-score"><Star size={13} fill="currentColor" /> {card.interviewValue}</span>
      </div>
    </button>
  )
}

function textFromChildren(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(textFromChildren).join('')
  if (children && typeof children === 'object' && 'props' in children) return textFromChildren((children as { props: { children?: ReactNode } }).props.children)
  return ''
}

function slugify(input: string): string {
  return input.trim().toLocaleLowerCase('zh-CN').replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-').slice(0, 72)
}

const markdownComponents: Components = {
  a: ({ href, children, ...props }) => {
    const safe = Boolean(href && /^https?:\/\//i.test(href))
    const onClick = (event: MouseEvent<HTMLAnchorElement>): void => {
      event.preventDefault()
      if (safe && href) void window.desktopApi.shell.openExternal(href)
    }
    return <a {...props} href={safe ? href : undefined} onClick={onClick} className={safe ? '' : 'unsafe-link'}>{children}{safe && <ExternalLink size={12} />}</a>
  },
  h1: ({ children }) => <h1 id={slugify(textFromChildren(children))}>{children}</h1>,
  h2: ({ children }) => <h2 id={slugify(textFromChildren(children))}>{children}</h2>,
  h3: ({ children }) => <h3 id={slugify(textFromChildren(children))}>{children}</h3>,
  table: ({ children }) => <div className="table-scroll"><table>{children}</table></div>,
  input: ({ type, checked, ...props }) => type === 'checkbox' ? <input {...props} type="checkbox" checked={checked} readOnly /> : <input {...props} type={type} readOnly />
}

export function MarkdownView({ markdown, className = '' }: { markdown: string; className?: string }): React.JSX.Element {
  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={markdownComponents}>
        {markdown}
      </ReactMarkdown>
    </div>
  )
}

function sectionIcon(title: string): ReactNode {
  if (/问题|症状|actual/i.test(title)) return <AlertTriangle size={17} />
  if (/根因|诊断|diagnosis/i.test(title)) return <Target size={17} />
  if (/方案|solution|worked/i.test(title)) return <Lightbulb size={17} />
  if (/验证|verification/i.test(title)) return <ShieldCheck size={17} />
  if (/面试|interview/i.test(title)) return <MessageSquareText size={17} />
  if (/经验|learn|fast/i.test(title)) return <Sparkles size={17} />
  return <Bookmark size={17} />
}

function isEvidence(section: KnowledgeSection): boolean {
  return /证据|evidence|日志|log/i.test(section.title)
}

function ReaderSections({ card }: { card: KnowledgeCard }): React.JSX.Element {
  if (!card.sections.length) return <MarkdownView markdown={card.markdown} />
  return (
    <div className="reader-sections">
      {card.sections.map((section, index) => {
        const id = section.slug || slugify(section.title) || `section-${index}`
        if (isEvidence(section)) {
          return (
            <details className="evidence-block" key={`${id}-${index}`}>
              <summary><span>{sectionIcon(section.title)}</span>{section.title}<ChevronDown size={16} /></summary>
              <MarkdownView markdown={section.content} />
            </details>
          )
        }
        return (
          <section className="reader-section" id={id} key={`${id}-${index}`}>
            <h2><span>{sectionIcon(section.title)}</span>{section.title}</h2>
            <MarkdownView markdown={section.content} />
          </section>
        )
      })}
    </div>
  )
}

function ConfidencePicker({ value, onChange }: { value: number; onChange: (value: number) => void }): React.JSX.Element {
  return (
    <div className="confidence-picker" role="radiogroup" aria-label="掌握信心">
      {[1, 2, 3, 4, 5].map((score) => (
        <button
          aria-checked={value === score}
          className={score <= value ? 'active' : ''}
          key={score}
          onClick={() => onChange(score)}
          role="radio"
          title={`信心 ${score}/5`}
          type="button"
        >
          <Star size={16} fill={score <= value ? 'currentColor' : 'none'} />
        </button>
      ))}
      <span>{value ? `${value}/5` : '未评估'}</span>
    </div>
  )
}

export function CardReader({
  card,
  state,
  relatedCards,
  onAction,
  onRelated,
  onClose
}: {
  card: KnowledgeCard
  state: CardLearningState
  relatedCards: KnowledgeCard[]
  onAction: (action: LearningAction) => Promise<void>
  onRelated: (cardId: string) => void
  onClose: () => void
}): React.JSX.Element {
  const [note, setNote] = useState(state.note)
  useEffect(() => setNote(state.note), [card.id, state.note])

  const persistNote = (): void => {
    if (note !== state.note) void onAction({ type: 'set-note', cardId: card.id, note })
  }

  return (
    <div className="reader-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <article className="card-reader" role="dialog" aria-modal="true" aria-labelledby="reader-title">
        <header className="reader-header">
          <div className="reader-identity">
            <span className="eyebrow">{card.id} · {card.domain}</span>
            <h1 id="reader-title">{card.title}</h1>
            <div className="reader-meta">
              <span>{card.project}</span>
              <span>创建于 {formatDate(card.createdAt)}</span>
              <span>{card.verification || '未标注验证状态'}</span>
            </div>
          </div>
          <div className="reader-head-actions">
            <button className={`icon-button ${state.favorite ? 'is-favorite' : ''}`} onClick={() => void onAction({ type: 'toggle-favorite', cardId: card.id })} title={state.favorite ? '取消收藏' : '收藏'} type="button">
              <Heart size={19} fill={state.favorite ? 'currentColor' : 'none'} />
            </button>
            <button className="icon-button" onClick={onClose} title="关闭（Esc）" type="button"><X size={21} /></button>
          </div>
        </header>

        <div className="reader-layout">
          <main className="reader-content">
            <div className="reader-summary">
              <div><span>经验价值</span><strong>{card.experienceScore}</strong></div>
              <div><span>学习价值</span><strong>{card.learningValue}</strong></div>
              <div><span>面试价值</span><strong>{card.interviewValue}</strong></div>
              <div><span>复用价值</span><strong>{card.reusability}</strong></div>
            </div>
            <ReaderSections card={card} />
            {relatedCards.length > 0 && (
              <section className="related-section">
                <h2><BookOpen size={18} />关联经验</h2>
                <div className="related-list">
                  {relatedCards.map((related) => (
                    <button key={related.id} onClick={() => onRelated(related.id)} type="button">
                      <span>{related.id}</span>{related.title}<ArrowUpRight size={15} />
                    </button>
                  ))}
                </div>
              </section>
            )}
          </main>

          <aside className="reader-aside">
            <section className="aside-card learning-control">
              <span className="aside-label">学习状态</span>
              <select value={state.status} onChange={(event) => void onAction({ type: 'set-status', cardId: card.id, status: event.target.value as LearningStatus })}>
                {Object.entries(learningStatusLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
              <span className="aside-label">掌握信心</span>
              <ConfidencePicker value={state.confidence} onChange={(confidence) => void onAction({ type: 'set-confidence', cardId: card.id, confidence })} />
              <div className="review-meta-mini">
                <span><Clock3 size={14} />已复习 {state.reviewCount} 次</span>
                <span><CheckCircle2 size={14} />Leitner 第 {state.box} 级</span>
              </div>
            </section>

            <section className="aside-card note-card">
              <span className="aside-label">我的笔记</span>
              <textarea
                aria-label="个人学习笔记"
                onBlur={persistNote}
                onChange={(event) => setNote(event.target.value)}
                placeholder="写下自己的理解、面试表达或待确认问题…"
                value={note}
              />
              <button className="small-button" disabled={note === state.note} onClick={persistNote} type="button">
                <Check size={14} />保存笔记
              </button>
            </section>

            <nav className="aside-card reader-toc" aria-label="本文目录">
              <span className="aside-label">本文目录</span>
              {card.sections.filter((section) => !isEvidence(section)).map((section, index) => (
                <a href={`#${section.slug || slugify(section.title) || `section-${index}`}`} key={`${section.slug}-${index}`}>{section.title}</a>
              ))}
            </nav>

            <button className="source-button" onClick={() => void window.desktopApi.shell.revealSourceCard(card.relativePath)} type="button">
              <FolderOpen size={16} />在文件夹中查看原卡片
            </button>
          </aside>
        </div>
      </article>
    </div>
  )
}

export function DocumentReader({ document, onClose }: { document: KnowledgeDocument; onClose: () => void }): React.JSX.Element {
  return (
    <div className="reader-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <article className="document-reader" role="dialog" aria-modal="true" aria-labelledby="document-title">
        <header className="document-reader-header">
          <div>
            <span className="eyebrow">{document.kind.toUpperCase()} · {formatDate(document.updatedAt)}</span>
            <h1 id="document-title">{document.title}</h1>
            <span className="document-path">{document.relativePath}</span>
          </div>
          <button className="icon-button" onClick={onClose} title="关闭（Esc）" type="button"><X size={21} /></button>
        </header>
        <main className="document-content"><MarkdownView markdown={document.markdown} /></main>
      </article>
    </div>
  )
}

export function DocumentTile({ document, onOpen }: { document: KnowledgeDocument; onOpen: () => void }): React.JSX.Element {
  return (
    <button className="document-tile" onClick={onOpen} type="button">
      <span className={`doc-kind kind-${document.kind}`}><FileText size={16} />{document.kind}</span>
      <h3>{document.title}</h3>
      <p>{document.plainText.slice(0, 120).replace(/\s+/g, ' ')}{document.plainText.length > 120 ? '…' : ''}</p>
      <div><span>{formatDate(document.updatedAt)}</span><span>阅读全文 <ArrowUpRight size={14} /></span></div>
    </button>
  )
}

export function DiagnosticList({ diagnostics }: { diagnostics: Array<{ relativePath: string; severity: 'warning' | 'error'; message: string }> }): React.JSX.Element {
  if (!diagnostics.length) {
    return <div className="diagnostic-ok"><CheckCircle2 size={18} />未发现格式异常，知识内容读取正常。</div>
  }
  return (
    <div className="diagnostic-list">
      {diagnostics.map((item, index) => (
        <article key={`${item.relativePath}-${index}`} className={`diagnostic-item ${item.severity}`}>
          <AlertTriangle size={17} />
          <div><strong>{item.message}</strong><span>{item.relativePath}</span></div>
        </article>
      ))}
    </div>
  )
}

export function QuickLegend(): React.JSX.Element {
  return (
    <div className="quick-legend">
      <span><span className="legend-dot due" />到期复习</span>
      <span><span className="legend-dot fresh" />推荐新卡</span>
      <span><Star size={13} fill="currentColor" />面试价值</span>
    </div>
  )
}

export function ReaderCloseHint(): React.JSX.Element {
  return <span className="reader-close-hint"><PanelRightClose size={14} />Esc 关闭阅读</span>
}
