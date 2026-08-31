import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  BarChart3,
  Bell,
  BookOpen,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderKanban,
  Library,
  Menu,
  MessageSquareText,
  Moon,
  RefreshCw,
  Search,
  Settings,
  Sun,
  Tags,
  X
} from 'lucide-react'
import type { ThemeMode } from '@shared/types'
import { CardReader, DocumentReader } from './components'
import { type AppView, getCardState, viewMeta } from './lib'
import { useAppStore } from './store'
import { DomainsView, LibraryView, ProjectsView, TodayView } from './views-main'
import { InterviewView, Onboarding, ProgressView, ReviewsView, SettingsView } from './views-more'

const navigation: Array<{ id: AppView; label: string; icon: ReactNode }> = [
  { id: 'today', label: '今日学习', icon: <BookOpen /> },
  { id: 'library', label: '经验库', icon: <Library /> },
  { id: 'projects', label: '项目专题', icon: <FolderKanban /> },
  { id: 'domains', label: '技术领域', icon: <Tags /> },
  { id: 'interview', label: '面试训练', icon: <MessageSquareText /> },
  { id: 'progress', label: '学习进度', icon: <BarChart3 /> },
  { id: 'reviews', label: '阶段复盘', icon: <FileText /> }
]

function resolveTheme(theme: ThemeMode): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function App(): React.JSX.Element {
  const ready = useAppStore((state) => state.ready)
  const loading = useAppStore((state) => state.loading)
  const error = useAppStore((state) => state.error)
  const initialize = useAppStore((state) => state.initialize)
  const snapshot = useAppStore((state) => state.snapshot)
  const learning = useAppStore((state) => state.learning)
  const activeView = useAppStore((state) => state.activeView)
  const navigate = useAppStore((state) => state.navigate)
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useAppStore((state) => state.toggleSidebar)
  const selectedCardId = useAppStore((state) => state.selectedCardId)
  const selectedDocument = useAppStore((state) => state.selectedDocument)
  const selectCard = useAppStore((state) => state.selectCard)
  const selectDocument = useAppStore((state) => state.selectDocument)
  const applyLearningAction = useAppStore((state) => state.applyLearningAction)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const refresh = useAppStore((state) => state.refresh)
  const refreshing = useAppStore((state) => state.refreshing)
  const toast = useAppStore((state) => state.toast)
  const showToast = useAppStore((state) => state.showToast)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    void initialize()
  }, [initialize])

  useEffect(() => {
    const theme = learning?.settings.theme ?? 'system'
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const resolved = resolveTheme(theme)
      document.documentElement.dataset.theme = resolved
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#101723' : '#f4f7fb')
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [learning?.settings.theme])

  useEffect(() => {
    const scale = learning?.settings.fontScale ?? 1
    document.documentElement.style.setProperty('--font-scale', String(scale))
    document.body.classList.toggle('wide-reading', Boolean(learning?.settings.wideReading))
  }, [learning?.settings.fontScale, learning?.settings.wideReading])

  useEffect(() => {
    document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'instant' })
  }, [activeView])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const isTyping = Boolean(target?.matches('input, textarea, select, [contenteditable="true"]'))
      if (event.key === '/' && !isTyping) {
        event.preventDefault()
        navigate('library')
        window.setTimeout(() => document.querySelector<HTMLInputElement>('[data-global-search]')?.focus(), 50)
      }
      if (event.key === 'Escape') {
        if (selectedCardId) selectCard(null)
        else if (selectedDocument) selectDocument(null)
        else setMobileNavOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate, selectCard, selectDocument, selectedCardId, selectedDocument])

  const selectedCard = useMemo(() => snapshot?.cards.find((card) => card.id === selectedCardId) ?? null, [snapshot, selectedCardId])
  const relatedCards = useMemo(() => {
    if (!selectedCard || !snapshot) return []
    return selectedCard.related.map((id) => snapshot.cards.find((card) => card.id === id)).filter((card): card is NonNullable<typeof card> => Boolean(card))
  }, [selectedCard, snapshot])

  if (loading || !ready) return <LoadingScreen />

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`app-sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
        <div className="brand-lockup app-brand">
          <span className="brand-mark"><BrainCircuit size={23} /></span>
          <span className="brand-text"><strong>工程经验</strong><small>求职学习中心</small></span>
          <button className="mobile-close icon-button" onClick={() => setMobileNavOpen(false)} title="关闭导航" type="button"><X size={19} /></button>
        </div>

        <nav className="primary-nav" aria-label="主导航">
          <span className="nav-section-label">学习中心</span>
          {navigation.map((item) => (
            <button
              aria-current={activeView === item.id ? 'page' : undefined}
              className={activeView === item.id ? 'active' : ''}
              key={item.id}
              onClick={() => { navigate(item.id); setMobileNavOpen(false) }}
              title={sidebarCollapsed ? item.label : undefined}
              type="button"
            >
              <span className="nav-icon">{item.icon}</span><span className="nav-label">{item.label}</span>
              {item.id === 'today' && <span className="nav-badge">{todayDueCount(snapshot, learning)}</span>}
            </button>
          ))}
          <span className="nav-section-label preferences">偏好</span>
          <button aria-current={activeView === 'settings' ? 'page' : undefined} className={activeView === 'settings' ? 'active' : ''} onClick={() => { navigate('settings'); setMobileNavOpen(false) }} title={sidebarCollapsed ? '设置' : undefined} type="button">
            <span className="nav-icon"><Settings /></span><span className="nav-label">设置</span>
          </button>
        </nav>

        <div className="sidebar-study-card">
          <div className="mini-ring"><span>{completionPercentage(snapshot?.cards.length ?? 0, learning)}</span></div>
          <div><strong>总体掌握度</strong><small>{masteredNumber(snapshot?.cards ?? [], learning)} / {snapshot?.cards.length ?? 0} 张</small></div>
        </div>

        <footer className="sidebar-footer">
          <button className="collapse-button" onClick={toggleSidebar} title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'} type="button">{sidebarCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}<span>收起侧栏</span></button>
        </footer>
      </aside>

      {mobileNavOpen && <button className="mobile-nav-scrim" onClick={() => setMobileNavOpen(false)} aria-label="关闭导航" type="button" />}

      <section className="app-main">
        <header className="topbar">
          <button className="mobile-menu icon-button" onClick={() => setMobileNavOpen(true)} title="打开导航" type="button"><Menu size={20} /></button>
          <div className="topbar-context"><span>{viewMeta[activeView].title}</span><i>/</i><small>{snapshot?.stats.cardCount ?? 0} 张经验卡</small></div>
          <div className="topbar-actions">
            <button className="top-search" onClick={() => { navigate('library'); window.setTimeout(() => document.querySelector<HTMLInputElement>('[data-global-search]')?.focus(), 50) }} type="button"><Search size={17} /><span>搜索知识</span><kbd>/</kbd></button>
            <button className="icon-button" disabled={refreshing} onClick={() => void refresh()} title="刷新知识库" type="button"><RefreshCw className={refreshing ? 'spin' : ''} size={18} /></button>
            <button className="icon-button" onClick={() => void updateSettings({ theme: resolveTheme(learning?.settings.theme ?? 'system') === 'dark' ? 'light' : 'dark' })} title="切换亮暗主题" type="button">
              {resolveTheme(learning?.settings.theme ?? 'system') === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="icon-button notification-button" onClick={() => showToast({ kind: 'info', message: todayDueCount(snapshot, learning) ? `今天还有 ${todayDueCount(snapshot, learning)} 张到期复习` : '今天没有过期复习任务' })} title="学习提醒" type="button"><Bell size={18} />{todayDueCount(snapshot, learning) > 0 && <span />}</button>
          </div>
        </header>

        {error && <div className="error-banner"><span>{error}</span><button onClick={() => navigate('settings')} type="button">检查设置</button></div>}

        <main className="page-scroll" id="main-content">
          {activeView === 'today' && <TodayView />}
          {activeView === 'library' && <LibraryView />}
          {activeView === 'projects' && <ProjectsView />}
          {activeView === 'domains' && <DomainsView />}
          {activeView === 'interview' && <InterviewView />}
          {activeView === 'progress' && <ProgressView />}
          {activeView === 'reviews' && <ReviewsView />}
          {activeView === 'settings' && <SettingsView />}
        </main>
      </section>

      {selectedCard && (
        <CardReader
          card={selectedCard}
          onAction={applyLearningAction}
          onClose={() => selectCard(null)}
          onRelated={selectCard}
          relatedCards={relatedCards}
          state={getCardState(learning, selectedCard.id)}
        />
      )}
      {selectedDocument && <DocumentReader document={selectedDocument} onClose={() => selectDocument(null)} />}
      <Onboarding />
      {toast && <div className={`toast toast-${toast.kind}`} role="status"><span>{toast.message}</span><button onClick={() => showToast(null)} title="关闭提示" type="button"><X size={15} /></button></div>}
    </div>
  )
}

function LoadingScreen(): React.JSX.Element {
  return (
    <div className="loading-screen">
      <div className="loading-brand"><span className="brand-mark"><BrainCircuit size={28} /></span><div><strong>工程经验</strong><small>求职学习中心</small></div></div>
      <div className="loading-line"><span /></div>
      <p>正在整理你的工程经验…</p>
    </div>
  )
}

function masteredNumber(cards: Array<{ id: string }>, learning: ReturnType<typeof useAppStore.getState>['learning']): number {
  return cards.filter((card) => getCardState(learning, card.id).status === 'mastered').length
}

function completionPercentage(total: number, learning: ReturnType<typeof useAppStore.getState>['learning']): string {
  if (!total) return '0%'
  return `${Math.round((Object.values(learning?.cards ?? {}).filter((state) => state.status === 'mastered').length / total) * 100)}%`
}

function todayDueCount(snapshot: ReturnType<typeof useAppStore.getState>['snapshot'], learning: ReturnType<typeof useAppStore.getState>['learning']): number {
  return (snapshot?.cards ?? []).filter((card) => {
    const next = learning?.cards[card.id]?.nextReviewAt
    return next && new Date(next).getTime() <= Date.now()
  }).length
}

export default App
