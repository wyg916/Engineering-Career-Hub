import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultLearningStore } from '../../src/core/learning'
import {
  LearningStoreService,
  readLearningStoreImport,
  writeJsonAtomically
} from '../../src/main/learning-store'

vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn()
  }
}))

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'experience-study-main-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('LearningStoreService', () => {
  it('persists actions atomically and reloads them after restart', async () => {
    const directory = await temporaryDirectory()
    const service = new LearningStoreService(directory)

    await service.apply({ type: 'toggle-favorite', cardId: 'ARCH-001' })
    const saved = await service.apply({ type: 'set-note', cardId: 'ARCH-001', note: '重点复习并发写入' })
    expect(saved.cards['ARCH-001']).toMatchObject({ favorite: true, note: '重点复习并发写入' })
    expect(saved.lastBackupAt).not.toBeNull()

    const reopened = new LearningStoreService(directory)
    const loaded = await reopened.load()
    expect(loaded.cards['ARCH-001']).toMatchObject({ favorite: true, note: '重点复习并发写入' })
    expect(JSON.parse(await readFile(join(directory, 'learning-state.v1.json'), 'utf8')).version).toBe(1)
    expect((await readdir(directory)).some((name) => name.endsWith('.tmp'))).toBe(false)
  })

  it('keeps only the five newest backups', async () => {
    const directory = await temporaryDirectory()
    const service = new LearningStoreService(directory)
    for (let index = 0; index < 7; index += 1) {
      await service.apply({ type: 'set-note', cardId: 'TEST-001', note: `note-${index}` })
    }

    const backups = await readdir(join(directory, 'backups'))
    expect(backups).toHaveLength(5)
    expect(new Set(backups).size).toBe(5)
  })

  it('recovers the newest valid backup when the primary file is corrupt', async () => {
    const directory = await temporaryDirectory()
    const service = new LearningStoreService(directory)
    await service.apply({ type: 'toggle-favorite', cardId: 'TEST-RECOVERY' })
    await service.apply({ type: 'set-note', cardId: 'TEST-RECOVERY', note: '新版状态' })
    await writeFile(join(directory, 'learning-state.v1.json'), '{broken json', 'utf8')

    const recovered = await new LearningStoreService(directory).load()
    expect(recovered.cards['TEST-RECOVERY'].favorite).toBe(true)
    expect(recovered.cards['TEST-RECOVERY'].note).toBe('')
  })
})

describe('atomic JSON and import validation', () => {
  it('replaces a JSON file without leaving temporary files', async () => {
    const directory = await temporaryDirectory()
    const target = join(directory, 'state.json')
    await writeJsonAtomically(target, { version: 1, value: 'old' })
    await writeJsonAtomically(target, { version: 1, value: 'new' })

    expect(JSON.parse(await readFile(target, 'utf8'))).toEqual({ version: 1, value: 'new' })
    expect((await readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('accepts valid V1 data and rejects invalid or unsafe imports', async () => {
    const directory = await temporaryDirectory()
    const validPath = join(directory, 'valid.json')
    const wrongVersionPath = join(directory, 'wrong-version.json')
    const unsafePath = join(directory, 'unsafe.json')

    const valid = createDefaultLearningStore()
    valid.settings.dailyMinutes = 30
    await writeFile(validPath, JSON.stringify(valid), 'utf8')
    await writeFile(wrongVersionPath, JSON.stringify({ ...valid, version: 2 }), 'utf8')
    await writeFile(
      unsafePath,
      '{"version":1,"settings":{},"cards":{"__proto__":{}},"reviews":[],"studyDays":[],"lastBackupAt":null}',
      'utf8'
    )

    await expect(readLearningStoreImport(validPath)).resolves.toMatchObject({
      version: 1,
      settings: { dailyMinutes: 30 }
    })
    await expect(readLearningStoreImport(wrongVersionPath)).rejects.toThrow('V1')
    await expect(readLearningStoreImport(unsafePath)).rejects.toThrow('V1')
  })
})
