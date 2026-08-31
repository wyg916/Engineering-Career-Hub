import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { KnowledgeService } from './knowledge-service'
import { LearningStoreService } from './learning-store'
import { KnowledgeRootResolver, validateKnowledgeRoot } from './root-resolver'
import { isPathStrictlyInside } from './path-security'
import type {
  AppSettings,
  DesktopApi,
  LearningAction,
  LearningStore,
  RootResolution
} from '../shared/types'

export const IPC_CHANNELS = {
  resolveRoot: 'config:resolve-knowledge-root',
  chooseRoot: 'config:choose-knowledge-root',
  loadSnapshot: 'knowledge:load-snapshot',
  refreshSnapshot: 'knowledge:refresh',
  knowledgeChanged: 'knowledge:changed',
  loadLearningState: 'learning:load-state',
  applyLearningAction: 'learning:apply-action',
  exportLearningState: 'learning:export-state',
  importLearningState: 'learning:import-state',
  revealSourceCard: 'shell:reveal-source-card',
  openExternal: 'shell:open-external'
} as const

type SettingsPatch = Partial<AppSettings>
type InvokeHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown, maximum = 4096): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 500 && value.every((item) => isNonEmptyString(item, 512))
}

function isSettingsPatch(value: unknown): value is SettingsPatch {
  if (!isRecord(value)) return false
  const allowed = new Set([
    'knowledgeRoot',
    'onboardingCompleted',
    'theme',
    'fontScale',
    'wideReading',
    'dailyMinutes',
    'dailyNewCards',
    'interviewDate',
    'focusProjects',
    'focusDomains'
  ])
  if (Object.keys(value).some((key) => !allowed.has(key))) return false
  if ('knowledgeRoot' in value && value.knowledgeRoot !== null && !isNonEmptyString(value.knowledgeRoot, 32767)) return false
  if ('onboardingCompleted' in value && typeof value.onboardingCompleted !== 'boolean') return false
  if ('theme' in value && !['light', 'dark', 'system'].includes(String(value.theme))) return false
  if ('fontScale' in value && (typeof value.fontScale !== 'number' || value.fontScale < 0.75 || value.fontScale > 2)) return false
  if ('wideReading' in value && typeof value.wideReading !== 'boolean') return false
  if (
    'dailyMinutes' in value &&
    (typeof value.dailyMinutes !== 'number' || !Number.isInteger(value.dailyMinutes) || value.dailyMinutes < 1 || value.dailyMinutes > 480)
  ) return false
  if (
    'dailyNewCards' in value &&
    (typeof value.dailyNewCards !== 'number' || !Number.isInteger(value.dailyNewCards) || value.dailyNewCards < 0 || value.dailyNewCards > 100)
  ) return false
  if (
    'interviewDate' in value &&
    value.interviewDate !== null &&
    (!isNonEmptyString(value.interviewDate, 64) || Number.isNaN(Date.parse(value.interviewDate)))
  ) return false
  if ('focusProjects' in value && !isStringArray(value.focusProjects)) return false
  if ('focusDomains' in value && !isStringArray(value.focusDomains)) return false
  return true
}

function isLearningAction(value: unknown): value is LearningAction {
  if (!isRecord(value) || typeof value.type !== 'string') return false
  const cardIdValid = isNonEmptyString(value.cardId, 512)
  switch (value.type) {
    case 'toggle-favorite':
      return cardIdValid && hasOnlyKeys(value, ['type', 'cardId'])
    case 'set-note':
      return cardIdValid && typeof value.note === 'string' && value.note.length <= 1024 * 1024 && hasOnlyKeys(value, ['type', 'cardId', 'note'])
    case 'set-status':
      return cardIdValid && ['new', 'learning', 'reviewing', 'mastered'].includes(String(value.status)) && hasOnlyKeys(value, ['type', 'cardId', 'status'])
    case 'set-confidence':
      return cardIdValid && typeof value.confidence === 'number' && Number.isInteger(value.confidence) && value.confidence >= 0 && value.confidence <= 5 && hasOnlyKeys(value, ['type', 'cardId', 'confidence'])
    case 'review':
      return (
        cardIdValid &&
        ['again', 'hard', 'good', 'easy'].includes(String(value.rating)) &&
        ['study', 'interview'].includes(String(value.mode)) &&
        (value.now === undefined || (isNonEmptyString(value.now, 64) && !Number.isNaN(Date.parse(value.now)))) &&
        hasOnlyKeys(value, ['type', 'cardId', 'rating', 'mode', 'now'])
      )
    case 'update-settings':
    case 'complete-onboarding':
      return isSettingsPatch(value.patch) && hasOnlyKeys(value, ['type', 'patch'])
    default:
      return false
  }
}

function assertTrustedSender(event: IpcMainInvokeEvent, window: BrowserWindow | null): void {
  if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('已拒绝来自非受信窗口的请求')
  }
}

function bind(channel: string, getWindow: () => BrowserWindow | null, handler: InvokeHandler): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedSender(event, getWindow())
    return handler(event, ...args)
  })
}

export class ApplicationServices {
  private readonly resolver = new KnowledgeRootResolver()
  private readonly knowledge: KnowledgeService
  private resolution: RootResolution = {
    root: null,
    source: 'none',
    valid: false,
    message: '尚未解析知识库'
  }

  constructor(
    private readonly learning: LearningStoreService,
    private readonly getWindow: () => BrowserWindow | null
  ) {
    this.knowledge = new KnowledgeService((snapshot) => {
      const window = this.getWindow()
      if (window && !window.isDestroyed()) window.webContents.send(IPC_CHANNELS.knowledgeChanged, snapshot)
    })
  }

  async resolveKnowledgeRoot(): Promise<RootResolution> {
    const store = await this.learning.load()
    const resolution = await this.resolver.resolve(store.settings.knowledgeRoot)
    this.resolution = resolution
    if (resolution.valid && resolution.root && store.settings.knowledgeRoot !== resolution.root) {
      try {
        await this.learning.apply({ type: 'update-settings', patch: { knowledgeRoot: resolution.root } })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { ...resolution, message: `${resolution.message}；本次可读，但无法保存选择：${message}` }
      }
    }
    return resolution
  }

  async chooseKnowledgeRoot(): Promise<RootResolution> {
    const store = await this.learning.load()
    const selected = await this.resolver.choose(this.getWindow(), this.resolution.root ?? store.settings.knowledgeRoot)
    if (!selected.valid || !selected.root) return selected

    try {
      await this.learning.apply({ type: 'update-settings', patch: { knowledgeRoot: selected.root } })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      selected.message = `${selected.message}；本次可读，但无法保存选择：${message}`
    }
    this.resolution = selected
    const snapshot = await this.knowledge.refresh(selected)
    const window = this.getWindow()
    if (window && !window.isDestroyed()) window.webContents.send(IPC_CHANNELS.knowledgeChanged, snapshot)
    return selected
  }

  async loadSnapshot() {
    const resolution = await this.resolveKnowledgeRoot()
    return this.knowledge.load(resolution)
  }

  async refreshSnapshot() {
    const resolution = await this.resolveKnowledgeRoot()
    return this.knowledge.refresh(resolution)
  }

  loadLearningState(): Promise<LearningStore> {
    return this.learning.load()
  }

  async applyAction(action: LearningAction): Promise<LearningStore> {
    const previous = await this.learning.load()
    const requestedRoot =
      action.type === 'update-settings' || action.type === 'complete-onboarding'
        ? action.patch.knowledgeRoot
        : undefined
    if (requestedRoot) {
      const checked = await validateKnowledgeRoot(requestedRoot)
      if (!checked.valid) throw new Error(checked.message)
      if (action.type === 'update-settings' || action.type === 'complete-onboarding') {
        action = { type: action.type, patch: { ...action.patch, knowledgeRoot: checked.root } }
      }
    }

    const next = await this.learning.apply(action)
    if (next.settings.knowledgeRoot !== previous.settings.knowledgeRoot) {
      const resolution = await this.resolveKnowledgeRoot()
      const snapshot = await this.knowledge.refresh(resolution)
      const window = this.getWindow()
      if (window && !window.isDestroyed()) window.webContents.send(IPC_CHANNELS.knowledgeChanged, snapshot)
      return this.learning.load()
    }
    return next
  }

  async importState() {
    const result = await this.learning.importState(this.getWindow())
    if (result.ok) {
      const resolution = await this.resolveKnowledgeRoot()
      const snapshot = await this.knowledge.refresh(resolution)
      const window = this.getWindow()
      if (window && !window.isDestroyed()) window.webContents.send(IPC_CHANNELS.knowledgeChanged, snapshot)
    }
    return result
  }

  async revealSourceCard(relativePath: string): Promise<boolean> {
    if (!this.resolution.valid || !this.resolution.root) await this.resolveKnowledgeRoot()
    if (!this.resolution.valid || !this.resolution.root || !isNonEmptyString(relativePath, 32767)) return false
    if (isAbsolute(relativePath) || relativePath.includes('\0')) return false

    try {
      const root = await realpath(this.resolution.root)
      const candidate = await realpath(resolve(root, relativePath))
      if (!isPathStrictlyInside(root, candidate) || !(await stat(candidate)).isFile()) return false
      shell.showItemInFolder(candidate)
      return true
    } catch {
      return false
    }
  }

  async openExternal(url: string): Promise<boolean> {
    if (!isNonEmptyString(url, 4096)) return false
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
      await shell.openExternal(parsed.toString())
      return true
    } catch {
      return false
    }
  }

  exportState() {
    return this.learning.exportState(this.getWindow())
  }

  dispose(): Promise<void> {
    return this.knowledge.dispose()
  }
}

export function registerIpcHandlers(services: ApplicationServices, getWindow: () => BrowserWindow | null): void {
  bind(IPC_CHANNELS.resolveRoot, getWindow, () => services.resolveKnowledgeRoot())
  bind(IPC_CHANNELS.chooseRoot, getWindow, () => services.chooseKnowledgeRoot())
  bind(IPC_CHANNELS.loadSnapshot, getWindow, () => services.loadSnapshot())
  bind(IPC_CHANNELS.refreshSnapshot, getWindow, () => services.refreshSnapshot())
  bind(IPC_CHANNELS.loadLearningState, getWindow, () => services.loadLearningState())
  bind(IPC_CHANNELS.applyLearningAction, getWindow, (_event, action) => {
    if (!isLearningAction(action)) throw new Error('无效的学习操作')
    return services.applyAction(action)
  })
  bind(IPC_CHANNELS.exportLearningState, getWindow, () => services.exportState())
  bind(IPC_CHANNELS.importLearningState, getWindow, () => services.importState())
  bind(IPC_CHANNELS.revealSourceCard, getWindow, (_event, relativePath) => {
    if (typeof relativePath !== 'string') return false
    return services.revealSourceCard(relativePath)
  })
  bind(IPC_CHANNELS.openExternal, getWindow, (_event, url) => {
    if (typeof url !== 'string') return false
    return services.openExternal(url)
  })
}

export type DesktopApiContract = DesktopApi
