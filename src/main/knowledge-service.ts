import { realpathSync } from 'node:fs'
import type { FSWatcher } from 'chokidar'
import { scanKnowledgeRoot } from '../core/knowledge'
import type { KnowledgeSnapshot, RootResolution } from '../shared/types'

const WATCH_DEBOUNCE_MS = 800
const IGNORED_DIRECTORIES = /(^|[\\/])(90_模板|99_系统)([\\/]|$)/

function canonicalWatchRoot(root: string): string {
  try {
    // Windows can expose the temp directory through an 8.3 alias while file
    // notifications return its long name. libuv requires both forms to match.
    return realpathSync.native(root)
  } catch {
    return root
  }
}

function unavailableSnapshot(resolution: RootResolution, previous?: KnowledgeSnapshot): KnowledgeSnapshot {
  const diagnostic = { relativePath: '', severity: 'error' as const, message: resolution.message }
  if (previous) {
    return {
      ...previous,
      diagnostics: [diagnostic, ...previous.diagnostics],
      scannedAt: new Date().toISOString()
    }
  }
  return {
    root: resolution.root ?? '',
    cards: [],
    documents: [],
    diagnostics: [diagnostic],
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

export class KnowledgeService {
  private watcher: FSWatcher | null = null
  private watcherReady: Promise<void> | null = null
  private watchedRoot: string | null = null
  private debounceTimer: NodeJS.Timeout | null = null
  private snapshot: KnowledgeSnapshot | null = null
  private scanPromise: Promise<KnowledgeSnapshot> | null = null
  private scanRoot: string | null = null

  constructor(private readonly onChanged: (snapshot: KnowledgeSnapshot) => void) {}

  async load(resolution: RootResolution): Promise<KnowledgeSnapshot> {
    if (resolution.valid && resolution.root && this.snapshot?.root === resolution.root) {
      await this.ensureWatcher(resolution.root)
      return this.snapshot
    }
    return this.refresh(resolution)
  }

  async refresh(resolution: RootResolution): Promise<KnowledgeSnapshot> {
    if (!resolution.valid || !resolution.root) {
      await this.stopWatcher()
      this.snapshot = unavailableSnapshot(resolution, this.snapshot ?? undefined)
      return this.snapshot
    }

    await this.ensureWatcher(resolution.root)
    if (this.scanPromise && this.scanRoot === resolution.root) return this.scanPromise
    if (this.scanPromise) {
      await this.scanPromise
      if (this.scanPromise && this.scanRoot === resolution.root) return this.scanPromise
    }
    const root = resolution.root
    this.scanRoot = root
    this.scanPromise = (async () => {
      try {
        const next = await scanKnowledgeRoot(root)
        this.snapshot = next
        return next
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const failed: RootResolution = {
          root,
          source: resolution.source,
          valid: false,
          message: `读取知识库失败：${message}`
        }
        this.snapshot = unavailableSnapshot(failed, this.snapshot?.root === root ? this.snapshot : undefined)
        return this.snapshot
      } finally {
        if (this.scanRoot === root) {
          this.scanPromise = null
          this.scanRoot = null
        }
      }
    })()
    return this.scanPromise
  }

  async dispose(): Promise<void> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = null
    await this.stopWatcher()
  }

  private async ensureWatcher(root: string): Promise<void> {
    if (this.watcher && this.watchedRoot === root) {
      if (this.watcherReady) await this.watcherReady
      return
    }
    await this.stopWatcher()
    this.watchedRoot = root
    const { default: chokidar } = await import('chokidar')
    const watcher = chokidar.watch(canonicalWatchRoot(root), {
      ignored: IGNORED_DIRECTORIES,
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 }
    })
    this.watcher = watcher
    watcher.on('all', () => this.scheduleRefresh(root))
    watcher.on('error', (error) => {
      const failed: RootResolution = {
        root,
        source: 'stored',
        valid: false,
        message: `知识库监听失败：${error instanceof Error ? error.message : String(error)}`
      }
      const snapshot = unavailableSnapshot(failed, this.snapshot?.root === root ? this.snapshot : undefined)
      this.snapshot = snapshot
      this.onChanged(snapshot)
    })
    this.watcherReady = new Promise<void>((resolveReady) => {
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        watcher.off('ready', finish)
        watcher.off('error', finish)
        resolveReady()
      }
      const timeout = setTimeout(finish, 3_000)
      watcher.once('ready', finish)
      watcher.once('error', finish)
    })
    await this.watcherReady
  }

  private scheduleRefresh(root: string): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      if (this.watchedRoot !== root) return
      const resolution: RootResolution = {
        root,
        source: 'stored',
        valid: true,
        message: '知识库文件已更新'
      }
      void this.refresh(resolution).then((snapshot) => this.onChanged(snapshot))
    }, WATCH_DEBOUNCE_MS)
  }

  private async stopWatcher(): Promise<void> {
    const watcher = this.watcher
    this.watcher = null
    this.watcherReady = null
    this.watchedRoot = null
    if (watcher) await watcher.close()
  }
}
