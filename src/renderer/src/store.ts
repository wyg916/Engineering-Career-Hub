import { create } from 'zustand'
import type {
  AppSettings,
  KnowledgeDocument,
  KnowledgeSnapshot,
  LearningAction,
  LearningStore,
  RootResolution
} from '@shared/types'
import { defaultFilters, type AppView, type CardFilters } from './lib'

interface ToastState {
  kind: 'success' | 'error' | 'info'
  message: string
}

interface AppState {
  ready: boolean
  loading: boolean
  refreshing: boolean
  error: string | null
  resolution: RootResolution | null
  snapshot: KnowledgeSnapshot | null
  learning: LearningStore | null
  activeView: AppView
  sidebarCollapsed: boolean
  selectedCardId: string | null
  selectedDocument: KnowledgeDocument | null
  filters: CardFilters
  toast: ToastState | null
  initialize: () => Promise<void>
  refresh: () => Promise<void>
  chooseRoot: () => Promise<RootResolution | null>
  navigate: (view: AppView) => void
  toggleSidebar: () => void
  selectCard: (cardId: string | null) => void
  selectDocument: (document: KnowledgeDocument | null) => void
  setFilters: (patch: Partial<CardFilters>) => void
  clearFilters: () => void
  applyLearningAction: (action: LearningAction) => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  completeOnboarding: (patch: Partial<AppSettings>) => Promise<void>
  exportState: () => Promise<void>
  importState: () => Promise<void>
  showToast: (toast: ToastState | null) => void
}

let removeKnowledgeListener: (() => void) | null = null
let toastTimer: ReturnType<typeof setTimeout> | null = null

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function emptySnapshot(root = ''): KnowledgeSnapshot {
  return {
    root,
    cards: [],
    documents: [],
    diagnostics: [],
    stats: {
      cardCount: 0,
      projectCount: 0,
      domainCount: 0,
      interviewCandidateCount: 0,
      documentCount: 0,
      byDomain: {},
      byProject: {}
    },
    scannedAt: new Date().toISOString()
  }
}

function emitToast(set: (patch: Partial<AppState>) => void, toast: ToastState): void {
  if (toastTimer) clearTimeout(toastTimer)
  set({ toast })
  toastTimer = setTimeout(() => set({ toast: null }), 3600)
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  loading: false,
  refreshing: false,
  error: null,
  resolution: null,
  snapshot: null,
  learning: null,
  activeView: 'today',
  sidebarCollapsed: false,
  selectedCardId: null,
  selectedDocument: null,
  filters: defaultFilters,
  toast: null,

  initialize: async () => {
    if (get().loading || get().ready) return
    set({ loading: true, error: null })
    try {
      if (!window.desktopApi) throw new Error('桌面桥接尚未就绪，请在 Electron 应用中打开。')
      const [resolution, learning] = await Promise.all([
        window.desktopApi.config.resolveKnowledgeRoot(),
        window.desktopApi.learning.loadState()
      ])
      let snapshot = emptySnapshot(resolution.root ?? '')
      if (resolution.valid) snapshot = await window.desktopApi.knowledge.loadSnapshot()
      set({ resolution, learning, snapshot, ready: true, loading: false })
      removeKnowledgeListener?.()
      removeKnowledgeListener = window.desktopApi.knowledge.onChanged((nextSnapshot) => {
        set({ snapshot: nextSnapshot, error: null })
        emitToast(set, { kind: 'info', message: `知识库已自动更新：${nextSnapshot.stats.cardCount} 张经验卡` })
      })
    } catch (error) {
      set({ loading: false, ready: true, error: readableError(error), snapshot: emptySnapshot() })
    }
  },

  refresh: async () => {
    if (get().refreshing) return
    set({ refreshing: true, error: null })
    try {
      const snapshot = await window.desktopApi.knowledge.refresh()
      set({ snapshot, refreshing: false })
      emitToast(set, { kind: 'success', message: `刷新完成，共读取 ${snapshot.stats.cardCount} 张经验卡` })
    } catch (error) {
      set({ refreshing: false, error: readableError(error) })
      emitToast(set, { kind: 'error', message: `刷新失败：${readableError(error)}` })
    }
  },

  chooseRoot: async () => {
    try {
      const resolution = await window.desktopApi.config.chooseKnowledgeRoot()
      set({ resolution })
      if (resolution.valid) {
        await get().updateSettings({ knowledgeRoot: resolution.root })
        const snapshot = await window.desktopApi.knowledge.refresh()
        set({ snapshot, error: null })
        emitToast(set, { kind: 'success', message: '知识库目录已连接' })
      }
      return resolution
    } catch (error) {
      emitToast(set, { kind: 'error', message: `选择目录失败：${readableError(error)}` })
      return null
    }
  },

  navigate: (activeView) => set({ activeView, selectedDocument: null }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  selectCard: (selectedCardId) => set({ selectedCardId }),
  selectDocument: (selectedDocument) => set({ selectedDocument }),
  setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),
  clearFilters: () => set({ filters: defaultFilters }),

  applyLearningAction: async (action) => {
    try {
      const learning = await window.desktopApi.learning.applyAction(action)
      set({ learning })
      if (action.type === 'review') emitToast(set, { kind: 'success', message: '复习结果已保存' })
    } catch (error) {
      emitToast(set, { kind: 'error', message: `保存失败：${readableError(error)}` })
    }
  },

  updateSettings: async (patch) => {
    await get().applyLearningAction({ type: 'update-settings', patch })
  },

  completeOnboarding: async (patch) => {
    try {
      const learning = await window.desktopApi.learning.applyAction({ type: 'complete-onboarding', patch })
      set({ learning })
      emitToast(set, { kind: 'success', message: '学习中心已准备好，开始今天的学习吧' })
    } catch (error) {
      emitToast(set, { kind: 'error', message: `保存引导设置失败：${readableError(error)}` })
    }
  },

  exportState: async () => {
    const result = await window.desktopApi.learning.exportState()
    emitToast(set, { kind: result.ok ? 'success' : 'error', message: result.message })
  },

  importState: async () => {
    const result = await window.desktopApi.learning.importState()
    if (result.ok) set({ learning: await window.desktopApi.learning.loadState() })
    emitToast(set, { kind: result.ok ? 'success' : 'error', message: result.message })
  },

  showToast: (toast) => {
    if (!toast) {
      set({ toast: null })
      return
    }
    emitToast(set, toast)
  }
}))
