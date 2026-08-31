import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, open, readFile, readdir, rename, stat, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { BrowserWindow, dialog } from 'electron'
import { applyLearningAction, createDefaultLearningStore, validateLearningStore } from '../core/learning'
import type { ExportResult, ImportResult, LearningAction, LearningStore } from '../shared/types'

const STORE_FILE = 'learning-state.v1.json'
const BACKUP_DIRECTORY = 'backups'
const BACKUP_PREFIX = 'learning-state.v1.'
const MAX_BACKUPS = 5
const MAX_IMPORT_BYTES = 20 * 1024 * 1024

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function syncParentDirectory(path: string): Promise<void> {
  if (process.platform === 'win32') return
  const handle = await open(dirname(path), 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

export async function writeJsonAtomically(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`)
  const handle = await open(temporaryPath, 'wx', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await handle.sync()
  } catch (error) {
    await handle.close().catch(() => undefined)
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
  await handle.close()
  try {
    await rename(temporaryPath, path)
    await syncParentDirectory(path)
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

function isImportShape(value: unknown): value is LearningStore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<LearningStore>
  return (
    candidate.version === 1 &&
    !!candidate.settings &&
    typeof candidate.settings === 'object' &&
    !!candidate.cards &&
    typeof candidate.cards === 'object' &&
    !Array.isArray(candidate.cards) &&
    Array.isArray(candidate.reviews) &&
    Array.isArray(candidate.studyDays)
  )
}

function containsUnsafeKey(value: unknown, depth = 0): boolean {
  if (depth > 32 || !value || typeof value !== 'object') return depth > 32
  if (Array.isArray(value)) return value.some((item) => containsUnsafeKey(item, depth + 1))
  const record = value as Record<string, unknown>
  return Object.keys(record).some(
    (key) =>
      key === '__proto__' ||
      key === 'prototype' ||
      key === 'constructor' ||
      containsUnsafeKey(record[key], depth + 1)
  )
}

export async function readLearningStoreImport(inputPath: string): Promise<LearningStore> {
  const inputInfo = await stat(inputPath)
  if (!inputInfo.isFile() || inputInfo.size > MAX_IMPORT_BYTES) {
    throw new Error('导入文件无效或超过 20MB 限制')
  }
  const parsed: unknown = JSON.parse(await readFile(inputPath, 'utf8'))
  if (!isImportShape(parsed) || containsUnsafeKey(parsed)) {
    throw new Error('导入文件不是可识别的 V1 学习数据')
  }
  return validateLearningStore(parsed)
}

export class LearningStoreService {
  private readonly statePath: string
  private readonly backupDirectory: string
  private cached: LearningStore | null = null
  private operation: Promise<void> = Promise.resolve()

  constructor(private readonly dataDirectory: string) {
    this.statePath = join(dataDirectory, STORE_FILE)
    this.backupDirectory = join(dataDirectory, BACKUP_DIRECTORY)
  }

  async load(): Promise<LearningStore> {
    if (this.cached) return structuredClone(this.cached)
    const loaded = await this.loadFromDisk()
    this.cached = loaded
    return structuredClone(loaded)
  }

  apply(action: LearningAction): Promise<LearningStore> {
    return this.enqueue(async () => {
      const current = this.cached ?? (await this.loadFromDisk())
      const next = applyLearningAction(current, action)
      const persisted = await this.persist(next)
      this.cached = persisted
      return structuredClone(persisted)
    })
  }

  async exportState(owner: BrowserWindow | null): Promise<ExportResult> {
    try {
      const state = await this.load()
      const date = new Date().toISOString().slice(0, 10)
      const options: Electron.SaveDialogOptions = {
        title: '导出学习数据',
        defaultPath: `工程经验学习数据-${date}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      }
      const selected = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options)
      if (selected.canceled || !selected.filePath) return { ok: false, message: '已取消导出' }
      await writeJsonAtomically(selected.filePath, state)
      return { ok: true, path: selected.filePath, message: '学习数据已导出' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, message: `导出失败：${message}` }
    }
  }

  importState(owner: BrowserWindow | null): Promise<ImportResult> {
    return this.enqueue(async () => {
      try {
        const options: Electron.OpenDialogOptions = {
          title: '导入学习数据',
          properties: ['openFile', 'dontAddToRecent'],
          filters: [{ name: 'JSON', extensions: ['json'] }]
        }
        const selected = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
        if (selected.canceled || selected.filePaths.length === 0) {
          return { ok: false, importedCards: 0, message: '已取消导入' }
        }
        const imported = await readLearningStoreImport(selected.filePaths[0])
        const persisted = await this.persist(imported)
        this.cached = persisted
        return {
          ok: true,
          importedCards: Object.keys(persisted.cards).length,
          message: '学习数据已导入'
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false, importedCards: 0, message: `导入失败：${message}` }
      }
    })
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.operation.then(task, task)
    this.operation = result.then(() => undefined, () => undefined)
    return result
  }

  private async loadFromDisk(): Promise<LearningStore> {
    const candidates: string[] = [this.statePath]
    try {
      const backups = await readdir(this.backupDirectory)
      candidates.push(
        ...backups
          .filter((name) => name.startsWith(BACKUP_PREFIX) && name.endsWith('.json'))
          .sort((left, right) => right.localeCompare(left))
          .map((name) => join(this.backupDirectory, name))
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    for (const candidate of candidates) {
      try {
        const parsed: unknown = JSON.parse(await readFile(candidate, 'utf8'))
        if (!isImportShape(parsed) || containsUnsafeKey(parsed)) continue
        return validateLearningStore(parsed)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) continue
        throw error
      }
    }
    return createDefaultLearningStore()
  }

  private async persist(store: LearningStore): Promise<LearningStore> {
    await mkdir(this.dataDirectory, { recursive: true })
    let persisted = store
    if (await fileExists(this.statePath)) {
      await mkdir(this.backupDirectory, { recursive: true })
      const backupTimestamp = new Date().toISOString()
      const backupPath = join(
        this.backupDirectory,
        `${BACKUP_PREFIX}${backupTimestamp.replace(/[:.]/g, '-')}.${randomUUID()}.json`
      )
      await copyFile(this.statePath, backupPath)
      persisted = { ...store, lastBackupAt: backupTimestamp }
    }
    await writeJsonAtomically(this.statePath, persisted)
    await this.rotateBackups()
    return persisted
  }

  private async rotateBackups(): Promise<void> {
    try {
      const backups = (await readdir(this.backupDirectory))
        .filter((name) => name.startsWith(BACKUP_PREFIX) && name.endsWith('.json'))
        .sort((left, right) => right.localeCompare(left))
      await Promise.all(backups.slice(MAX_BACKUPS).map((name) => unlink(join(this.backupDirectory, name))))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}
