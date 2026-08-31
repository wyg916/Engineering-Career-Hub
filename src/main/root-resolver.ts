import { access, readFile, realpath, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { BrowserWindow, dialog } from 'electron'
import type { RootResolution } from '../shared/types'

const REQUIRED_KNOWLEDGE_DIRECTORY = '01_原始经验卡片'
const CONFIG_FILE = 'experience-recorder.json'
const MAX_CONFIG_BYTES = 1024 * 1024

function expandPath(value: string): string {
  let expanded = value.trim()
  if (expanded === '~' || expanded.startsWith('~/') || expanded.startsWith('~\\')) {
    expanded = join(homedir(), expanded.slice(1))
  }
  expanded = expanded.replace(/%([^%]+)%/g, (match, name: string) => process.env[name] ?? match)
  expanded = expanded.replace(/\$\{([^}]+)\}/g, (match, name: string) => process.env[name] ?? match)
  return isAbsolute(expanded) ? resolve(expanded) : resolve(expanded)
}

async function readConfiguredRoot(configPath: string): Promise<{ root: string | null; error?: string }> {
  try {
    const file = await stat(configPath)
    if (!file.isFile()) return { root: null, error: `${configPath} 不是文件` }
    if (file.size > MAX_CONFIG_BYTES) return { root: null, error: `${configPath} 超过 1MB 限制` }

    const parsed: unknown = JSON.parse(await readFile(configPath, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { root: null, error: `${configPath} 不是 JSON 对象` }
    }
    const configured = (parsed as Record<string, unknown>).knowledge_root
    if (typeof configured !== 'string' || !configured.trim()) {
      return { root: null, error: `${configPath} 未配置 knowledge_root` }
    }
    return { root: expandPath(configured) }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return { root: null }
    const message = error instanceof Error ? error.message : String(error)
    return { root: null, error: `${configPath} 读取失败：${message}` }
  }
}

export async function validateKnowledgeRoot(candidate: string | null | undefined): Promise<RootResolution> {
  if (!candidate?.trim()) {
    return { root: null, source: 'none', valid: false, message: '尚未选择知识库目录' }
  }
  try {
    const root = await realpath(expandPath(candidate))
    const info = await stat(root)
    if (!info.isDirectory()) {
      return { root: null, source: 'none', valid: false, message: '所选路径不是目录' }
    }
    const cardsDirectory = join(root, REQUIRED_KNOWLEDGE_DIRECTORY)
    if (!(await stat(cardsDirectory)).isDirectory()) {
      return {
        root: null,
        source: 'none',
        valid: false,
        message: `目录中缺少 ${REQUIRED_KNOWLEDGE_DIRECTORY}，不是可识别的经验知识库`
      }
    }
    await access(root, constants.R_OK)
    return { root, source: 'none', valid: true, message: '知识库可读' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { root: null, source: 'none', valid: false, message: `知识库不可用：${message}` }
  }
}

export class KnowledgeRootResolver {
  async resolve(storedRoot: string | null): Promise<RootResolution> {
    const issues: string[] = []
    if (storedRoot) {
      const stored = await validateKnowledgeRoot(storedRoot)
      if (stored.valid) return { ...stored, source: 'stored', message: '已使用上次选择的知识库' }
      issues.push(`已保存路径无效：${stored.message}`)
    }

    const candidates: Array<{ path: string; source: RootResolution['source'] }> = []
    const codexHome = process.env.CODEX_HOME?.trim()
    if (codexHome) candidates.push({ path: join(expandPath(codexHome), CONFIG_FILE), source: 'codex-config' })

    const fallbackConfig = join(process.env.USERPROFILE?.trim() || homedir(), '.codex', CONFIG_FILE)
    if (!candidates.some((candidate) => candidate.path.toLocaleLowerCase() === fallbackConfig.toLocaleLowerCase())) {
      candidates.push({ path: fallbackConfig, source: 'fallback' })
    }

    for (const candidate of candidates) {
      const configured = await readConfiguredRoot(candidate.path)
      if (configured.error) issues.push(configured.error)
      if (!configured.root) continue
      const checked = await validateKnowledgeRoot(configured.root)
      if (checked.valid) {
        return { ...checked, source: candidate.source, message: `已从 ${candidate.path} 发现知识库` }
      }
      issues.push(`${candidate.path} 中的 knowledge_root 无效：${checked.message}`)
    }
    return {
      root: null,
      source: 'none',
      valid: false,
      message: issues.length ? issues.join('；') : '未自动发现知识库，请手动选择'
    }
  }

  async choose(owner: BrowserWindow | null, initialRoot: string | null): Promise<RootResolution> {
    const options: Electron.OpenDialogOptions = {
      title: '选择个人工程经验知识库',
      buttonLabel: '使用此知识库',
      properties: ['openDirectory', 'dontAddToRecent']
    }
    if (initialRoot) options.defaultPath = initialRoot
    const selected = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
    if (selected.canceled || selected.filePaths.length === 0) {
      return { root: null, source: 'none', valid: false, message: '已取消选择' }
    }
    const checked = await validateKnowledgeRoot(selected.filePaths[0])
    return checked.valid ? { ...checked, source: 'manual', message: '已选择可用的知识库' } : checked
  }
}
