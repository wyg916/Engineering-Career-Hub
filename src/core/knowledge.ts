import { promises as fs } from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'

import type {
  ContentKind,
  KnowledgeCard,
  KnowledgeDiagnostic,
  KnowledgeDocument,
  KnowledgeSection,
  KnowledgeSnapshot,
  KnowledgeStats
} from '../shared/types'

const CONTENT_FOLDERS = {
  '01_原始经验卡片': 'card',
  '02_项目经历索引': 'project',
  '04_面试知识库': 'interview',
  '05_阶段复盘': 'review',
  '06_待学习知识': 'learning'
} as const satisfies Record<string, ContentKind>

const STANDARD_SECTION_NAMES: Array<[RegExp, string]> = [
  [/^(?:背景|context)/i, '背景与目标'],
  [/^(?:问题|problem)/i, '问题表现'],
  [/^(?:预期)/i, '预期'],
  [/^(?:实际)/i, '实际'],
  [/^(?:影响|impact)/i, '影响'],
  [/^(?:排查|诊断|diagnosis)/i, '排查过程'],
  [/^(?:根因|root cause)/i, '根因'],
  [/^(?:尝试|失败方案|attempt)/i, '失败或被否决的方案'],
  [/^(?:最终解决|解决方案|final solution)/i, '最终解决方案'],
  [/^(?:为什么.*有效|why it worked)/i, '为什么这个方案有效'],
  [/^(?:验证|verification)/i, '验证'],
  [/^(?:遗留|残余风险|residual)/i, '遗留风险'],
  [/^(?:我真正学到|经验|lessons)/i, '我真正学到了什么'],
  [/^(?:下次|fast path)/i, '下次再遇到，最快怎么定位'],
  [/^(?:面试|interview)/i, '面试提炼'],
  [/^(?:occurrences?)/i, 'Occurrences'],
  [/^(?:evidence|证据索引)/i, 'Evidence']
]

export interface KnowledgeSourceFile {
  relativePath: string
  markdown: string
  updatedAt?: string
}

export interface ParsedKnowledgeFile {
  card?: KnowledgeCard
  document?: KnowledgeDocument
  diagnostics: KnowledgeDiagnostic[]
}

interface FrontmatterResult {
  body: string
  data: Record<string, unknown>
  present: boolean
  error?: string
}

export const knowledgeContentFolders = Object.freeze({ ...CONTENT_FOLDERS })

function normalizeRelativePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '')
}

function contentKindFor(relativePath: string): ContentKind | null {
  const firstSegment = normalizeRelativePath(relativePath).split('/')[0]
  return firstSegment && firstSegment in CONTENT_FOLDERS
    ? CONTENT_FOLDERS[firstSegment as keyof typeof CONTENT_FOLDERS]
    : null
}

function splitFrontmatter(markdown: string): FrontmatterResult {
  const normalized = markdown.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n')
  const lines = normalized.split('\n')
  if (lines[0]?.trim() !== '---') {
    return { body: normalized, data: {}, present: false }
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (closingIndex < 0) {
    return {
      body: normalized,
      data: {},
      present: true,
      error: 'YAML frontmatter 缺少结束分隔符。'
    }
  }

  const source = lines.slice(1, closingIndex).join('\n')
  const body = lines.slice(closingIndex + 1).join('\n')
  try {
    const parsed: unknown = parseYaml(source)
    if (parsed == null) return { body, data: {}, present: true }
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { body, data: {}, present: true, error: 'YAML frontmatter 必须是键值对象。' }
    }
    return { body, data: parsed as Record<string, unknown>, present: true }
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error)
    return { body, data: {}, present: true, error: `YAML frontmatter 无法解析：${message}` }
  }
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(asString(value))
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback
}

function asStringArray(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,，]/)
      : []
  return [...new Set(values.map((entry) => asString(entry)).filter(Boolean))]
}

function normalizeDate(value: unknown, fallback = ''): string {
  const candidate = asString(value)
  if (!candidate) return fallback
  const time = Date.parse(candidate)
  return Number.isFinite(time) ? candidate : fallback
}

function fileStem(relativePath: string): string {
  return path.posix.basename(normalizeRelativePath(relativePath), path.posix.extname(relativePath))
}

function extractTitle(body: string, fallback: string): string {
  const heading = body.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim()
  if (!heading) return fallback
  return heading.replace(/^EXP-[A-Z]+-\d{8}-\d+(?:-[^：:]+)?\s*[：:]\s*/i, '').trim() || fallback
}

function canonicalSectionTitle(title: string): string {
  const withoutOrder = title.replace(/^\d+(?:\.\d+)*[.、]\s*/, '').trim()
  const canonical = STANDARD_SECTION_NAMES.find(([pattern]) => pattern.test(withoutOrder))
  return canonical?.[1] ?? withoutOrder
}

function slugify(title: string, fallback: string): string {
  const slug = title
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return slug || fallback
}

export function extractKnowledgeSections(body: string): KnowledgeSection[] {
  const lines = body.replaceAll('\r\n', '\n').split('\n')
  const headings: Array<{ line: number; level: number; title: string }> = []

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{2,6})\s+(.+?)\s*$/.exec(lines[index] ?? '')
    if (!match) continue
    headings.push({
      line: index,
      level: match[1]?.length ?? 2,
      title: canonicalSectionTitle(match[2] ?? '')
    })
  }

  const slugCounts = new Map<string, number>()
  return headings.map((heading, index) => {
    const nextHeading = headings.slice(index + 1).find((candidate) => candidate.level <= heading.level)
    const content = lines.slice(heading.line + 1, nextHeading?.line ?? lines.length).join('\n').trim()
    const baseSlug = slugify(heading.title, `section-${index + 1}`)
    const seen = slugCounts.get(baseSlug) ?? 0
    slugCounts.set(baseSlug, seen + 1)
    return {
      level: heading.level,
      title: heading.title,
      slug: seen === 0 ? baseSlug : `${baseSlug}-${seen + 1}`,
      content
    }
  })
}

export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^---\s*$[\s\S]*?^---\s*$/m, ' ')
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/^```[^\n]*|```$/g, ' '))
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*+] |\d+[.)]\s+)/gm, '')
    .replace(/[>*_~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseKnowledgeMarkdown(
  markdown: string,
  relativePath: string,
  updatedAt = ''
): ParsedKnowledgeFile {
  const normalizedPath = normalizeRelativePath(relativePath)
  const kind = contentKindFor(normalizedPath)
  const diagnostics: KnowledgeDiagnostic[] = []
  if (!kind) {
    return {
      diagnostics: [{
        relativePath: normalizedPath,
        severity: 'warning',
        message: '文件不在允许扫描的知识目录中，已忽略。'
      }]
    }
  }

  const frontmatter = splitFrontmatter(markdown)
  if (frontmatter.error) {
    diagnostics.push({ relativePath: normalizedPath, severity: 'error', message: frontmatter.error })
  }

  const fallbackTitle = fileStem(normalizedPath)
  const title = asString(frontmatter.data.title) || extractTitle(frontmatter.body, fallbackTitle)
  const plainText = markdownToPlainText(frontmatter.body)
  const normalizedUpdatedAt = normalizeDate(frontmatter.data.updated_at, normalizeDate(updatedAt))

  if (kind !== 'card') {
    return {
      document: {
        id: `document:${normalizedPath}`,
        kind,
        title,
        markdown,
        plainText,
        relativePath: normalizedPath,
        updatedAt: normalizedUpdatedAt
      },
      diagnostics
    }
  }

  if (!frontmatter.present) {
    diagnostics.push({
      relativePath: normalizedPath,
      severity: 'error',
      message: '经验卡缺少 YAML frontmatter，无法安全载入。'
    })
    return { diagnostics }
  }
  if (frontmatter.error) return { diagnostics }

  const id = asString(frontmatter.data.id, fallbackTitle)
  const requiredStrings: Array<[string, string]> = [
    ['id', id],
    ['title', asString(frontmatter.data.title)],
    ['project', asString(frontmatter.data.project)],
    ['domain', asString(frontmatter.data.domain)]
  ]
  const missing = requiredStrings.filter(([, value]) => !value).map(([name]) => name)
  if (missing.length > 0) {
    diagnostics.push({
      relativePath: normalizedPath,
      severity: 'warning',
      message: `经验卡缺少元数据：${missing.join(', ')}；已使用安全默认值。`
    })
  }

  const card: KnowledgeCard = {
    id,
    title,
    createdAt: normalizeDate(frontmatter.data.created_at, normalizedUpdatedAt),
    updatedAt: normalizedUpdatedAt,
    project: asString(frontmatter.data.project, '未分类项目'),
    domain: asString(frontmatter.data.domain, 'OTHER').toLocaleUpperCase(),
    type: asString(frontmatter.data.type, 'unknown'),
    status: asString(frontmatter.data.status, 'unknown'),
    verification: asString(frontmatter.data.verification, 'unknown'),
    impact: asNumber(frontmatter.data.impact),
    diagnosisDepth: asNumber(frontmatter.data.diagnosis_depth),
    technicalDepth: asNumber(frontmatter.data.technical_depth),
    experienceScore: asNumber(frontmatter.data.experience_score),
    difficulty: asNumber(frontmatter.data.difficulty),
    learningValue: asNumber(frontmatter.data.learning_value),
    interviewValue: asNumber(frontmatter.data.interview_value),
    reusability: asNumber(frontmatter.data.reusability),
    tags: asStringArray(frontmatter.data.tags),
    related: asStringArray(frontmatter.data.related),
    sections: extractKnowledgeSections(frontmatter.body),
    markdown,
    plainText,
    relativePath: normalizedPath
  }

  return { card, diagnostics }
}

function sortedCountRecord(values: string[]): Record<string, number> {
  const counts = new Map<string, number>()
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1)
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right, 'zh-CN')))
}

function createStats(cards: KnowledgeCard[], documents: KnowledgeDocument[]): KnowledgeStats {
  const byDomain = sortedCountRecord(cards.map((card) => card.domain))
  const byProject = sortedCountRecord(cards.map((card) => card.project))
  return {
    cardCount: cards.length,
    projectCount: Object.keys(byProject).length,
    domainCount: Object.keys(byDomain).length,
    interviewCandidateCount: cards.filter((card) => card.interviewValue >= 4).length,
    documentCount: documents.length,
    byDomain,
    byProject
  }
}

export function buildKnowledgeSnapshot(
  root: string,
  sources: KnowledgeSourceFile[],
  scannedAt = new Date().toISOString(),
  initialDiagnostics: KnowledgeDiagnostic[] = []
): KnowledgeSnapshot {
  const cards: KnowledgeCard[] = []
  const documents: KnowledgeDocument[] = []
  const diagnostics = [...initialDiagnostics]
  const seenIds = new Map<string, string>()

  for (const source of [...sources].sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'zh-CN'))) {
    const parsed = parseKnowledgeMarkdown(source.markdown, source.relativePath, source.updatedAt)
    diagnostics.push(...parsed.diagnostics)
    if (parsed.document) documents.push(parsed.document)
    if (!parsed.card) continue

    const previousPath = seenIds.get(parsed.card.id)
    if (previousPath) {
      diagnostics.push({
        relativePath: parsed.card.relativePath,
        severity: 'error',
        message: `经验卡 ID ${parsed.card.id} 与 ${previousPath} 重复，当前文件已忽略。`
      })
      continue
    }
    seenIds.set(parsed.card.id, parsed.card.relativePath)
    cards.push(parsed.card)
  }

  return {
    root: path.resolve(root),
    cards,
    documents,
    diagnostics,
    stats: createStats(cards, documents),
    scannedAt
  }
}

async function collectMarkdownFiles(root: string): Promise<{ sources: KnowledgeSourceFile[]; diagnostics: KnowledgeDiagnostic[] }> {
  const sources: KnowledgeSourceFile[] = []
  const diagnostics: KnowledgeDiagnostic[] = []

  async function visit(directory: string, folderName: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(directory, { withFileTypes: true })
    } catch (error) {
      diagnostics.push({
        relativePath: folderName,
        severity: 'error',
        message: `目录无法读取：${error instanceof Error ? error.message : String(error)}`
      })
      return
    }

    entries.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name)
      const relativePath = normalizeRelativePath(path.relative(root, absolutePath))
      if (entry.isSymbolicLink()) {
        diagnostics.push({ relativePath, severity: 'warning', message: '符号链接已忽略。' })
        continue
      }
      if (entry.isDirectory()) {
        await visit(absolutePath, folderName)
        continue
      }
      if (!entry.isFile() || path.extname(entry.name).toLocaleLowerCase() !== '.md') continue
      try {
        const [markdown, stat] = await Promise.all([fs.readFile(absolutePath, 'utf8'), fs.stat(absolutePath)])
        sources.push({ relativePath, markdown, updatedAt: stat.mtime.toISOString() })
      } catch (error) {
        diagnostics.push({
          relativePath,
          severity: 'error',
          message: `文件无法读取：${error instanceof Error ? error.message : String(error)}`
        })
      }
    }
  }

  for (const folderName of Object.keys(CONTENT_FOLDERS)) {
    const directory = path.join(root, folderName)
    try {
      const stat = await fs.stat(directory)
      if (!stat.isDirectory()) throw new Error('路径不是目录')
      await visit(directory, folderName)
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
      diagnostics.push({
        relativePath: folderName,
        severity: code === 'ENOENT' ? 'warning' : 'error',
        message: code === 'ENOENT'
          ? '知识目录不存在，已跳过。'
          : `知识目录不可用：${error instanceof Error ? error.message : String(error)}`
      })
    }
  }

  return { sources, diagnostics }
}

export async function scanKnowledgeRoot(root: string): Promise<KnowledgeSnapshot> {
  const resolvedRoot = path.resolve(root)
  const { sources, diagnostics } = await collectMarkdownFiles(resolvedRoot)
  return buildKnowledgeSnapshot(resolvedRoot, sources, new Date().toISOString(), diagnostics)
}
