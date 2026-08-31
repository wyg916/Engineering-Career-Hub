import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isPathStrictlyInside } from '../../src/main/path-security'
import { KnowledgeRootResolver, validateKnowledgeRoot } from '../../src/main/root-resolver'

vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: { showOpenDialog: vi.fn() }
}))

const temporaryDirectories: string[] = []
let originalCodexHome: string | undefined
let originalUserProfile: string | undefined

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'experience-study-root-'))
  temporaryDirectories.push(directory)
  return directory
}

async function createKnowledgeRoot(parent: string, name: string): Promise<string> {
  const root = join(parent, name)
  await mkdir(join(root, '01_原始经验卡片'), { recursive: true })
  return realpath(root)
}

beforeEach(() => {
  originalCodexHome = process.env.CODEX_HOME
  originalUserProfile = process.env.USERPROFILE
})

afterEach(async () => {
  if (originalCodexHome === undefined) delete process.env.CODEX_HOME
  else process.env.CODEX_HOME = originalCodexHome
  if (originalUserProfile === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = originalUserProfile
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('validateKnowledgeRoot', () => {
  it('accepts a readable knowledge root with the card directory', async () => {
    const parent = await temporaryDirectory()
    const root = await createKnowledgeRoot(parent, '个人工程经验知识库')
    const result = await validateKnowledgeRoot(root)

    expect(result).toMatchObject({ root, valid: true })
  })

  it('rejects an ordinary directory without the required card directory', async () => {
    const directory = await temporaryDirectory()
    const result = await validateKnowledgeRoot(directory)

    expect(result.valid).toBe(false)
    expect(result.root).toBeNull()
  })
})

describe('KnowledgeRootResolver', () => {
  it('prefers CODEX_HOME config and falls back to USERPROFILE/.codex', async () => {
    const parent = await temporaryDirectory()
    const codexHome = join(parent, 'codex-home')
    const userProfile = join(parent, 'user')
    const preferredRoot = await createKnowledgeRoot(parent, 'preferred-root')
    const fallbackRoot = await createKnowledgeRoot(parent, 'fallback-root')
    await mkdir(codexHome, { recursive: true })
    await mkdir(join(userProfile, '.codex'), { recursive: true })
    await writeFile(join(codexHome, 'experience-recorder.json'), JSON.stringify({ knowledge_root: preferredRoot }), 'utf8')
    await writeFile(
      join(userProfile, '.codex', 'experience-recorder.json'),
      JSON.stringify({ knowledge_root: fallbackRoot }),
      'utf8'
    )
    process.env.CODEX_HOME = codexHome
    process.env.USERPROFILE = userProfile

    const preferred = await new KnowledgeRootResolver().resolve(null)
    expect(preferred).toMatchObject({ root: preferredRoot, source: 'codex-config', valid: true })

    await rm(join(codexHome, 'experience-recorder.json'))
    const fallback = await new KnowledgeRootResolver().resolve(null)
    expect(fallback).toMatchObject({ root: fallbackRoot, source: 'fallback', valid: true })
  })

  it('keeps a valid manually stored root ahead of automatic config', async () => {
    const parent = await temporaryDirectory()
    const storedRoot = await createKnowledgeRoot(parent, 'stored-root')
    process.env.CODEX_HOME = join(parent, 'missing-codex-home')
    process.env.USERPROFILE = join(parent, 'missing-user')

    const result = await new KnowledgeRootResolver().resolve(storedRoot)
    expect(result).toMatchObject({ root: storedRoot, source: 'stored', valid: true })
  })
})

describe('isPathStrictlyInside', () => {
  it('accepts descendants and rejects traversal, siblings and the root itself', () => {
    const root = resolve('C:/knowledge-root')
    expect(isPathStrictlyInside(root, join(root, '01_原始经验卡片', 'ARCH-001.md'))).toBe(true)
    expect(isPathStrictlyInside(root, root)).toBe(false)
    expect(isPathStrictlyInside(root, resolve(root, '..', 'knowledge-root-other', 'ARCH-001.md'))).toBe(false)
    expect(isPathStrictlyInside(root, resolve(root, '..', 'outside.md'))).toBe(false)
  })
})
