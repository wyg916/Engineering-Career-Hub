import type {
  AppSettings,
  CardLearningState,
  KnowledgeCard,
  KnowledgeDocument,
  KnowledgeSnapshot,
  LearningStore,
  ReviewRating
} from '@shared/types'
import { searchCards as searchKnowledgeCards } from '../../core/search'

export type AppView =
  | 'today'
  | 'library'
  | 'projects'
  | 'domains'
  | 'interview'
  | 'progress'
  | 'reviews'
  | 'settings'

export interface CardFilters {
  query: string
  project: string
  domain: string
  verification: string
  learningValue: string
  interviewValue: string
  mastery: string
  dateFrom: string
  dateTo: string
  favoriteOnly: boolean
}

export const defaultFilters: CardFilters = {
  query: '',
  project: '',
  domain: '',
  verification: '',
  learningValue: '',
  interviewValue: '',
  mastery: '',
  dateFrom: '',
  dateTo: '',
  favoriteOnly: false
}

export const viewMeta: Record<AppView, { title: string; eyebrow: string; description: string }> = {
  today: {
    title: '今日学习',
    eyebrow: 'TODAY · STUDY FLOW',
    description: '把最值得复习的工程经验，变成今天真正掌握的能力。'
  },
  library: {
    title: '经验库',
    eyebrow: 'KNOWLEDGE LIBRARY',
    description: '搜索、筛选并深读每一条真实工程经验。'
  },
  projects: {
    title: '项目专题',
    eyebrow: 'PROJECT STORIES',
    description: '沿项目脉络复盘问题、决策与交付成果。'
  },
  domains: {
    title: '技术领域',
    eyebrow: 'TECH DOMAINS',
    description: '看清能力版图，集中补齐薄弱技术方向。'
  },
  interview: {
    title: '面试训练',
    eyebrow: 'INTERVIEW PRACTICE',
    description: '用真实项目经历练出清楚、有证据的回答。'
  },
  progress: {
    title: '学习进度',
    eyebrow: 'LEARNING INSIGHTS',
    description: '掌握节奏、连续学习和薄弱领域一目了然。'
  },
  reviews: {
    title: '阶段复盘',
    eyebrow: 'REVIEWS & NOTES',
    description: '浏览项目索引、阶段总结、面试材料与待学习内容。'
  },
  settings: {
    title: '设置',
    eyebrow: 'PREFERENCES',
    description: '调整阅读体验、知识库位置和学习计划。'
  }
}

export const learningStatusLabel: Record<string, string> = {
  new: '未开始',
  learning: '学习中',
  reviewing: '待复习',
  mastered: '已掌握'
}

export const ratingLabel: Record<ReviewRating, string> = {
  again: '忘记',
  hard: '困难',
  good: '掌握',
  easy: '轻松'
}

export const ratingHint: Record<ReviewRating, string> = {
  again: '今天再来一次',
  hard: '明天复习',
  good: '进入下一阶段',
  easy: '跨越两个阶段'
}

export function formatDate(value: string | null | undefined, withYear = true): string {
  if (!value) return '未设置'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: withYear ? 'numeric' : undefined,
    month: 'short',
    day: 'numeric'
  }).format(date)
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function localDayKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function startOfDay(value: string | Date): number {
  const date = value instanceof Date ? new Date(value) : new Date(value)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function daysBetween(from: string | Date, to: string | Date): number {
  return Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000)
}

export function daysUntil(value: string | null): number | null {
  if (!value) return null
  const days = daysBetween(new Date(), value)
  return Number.isFinite(days) ? days : null
}

export function isDue(state: CardLearningState | undefined, now = new Date()): boolean {
  if (!state?.nextReviewAt) return false
  return new Date(state.nextReviewAt).getTime() <= now.getTime()
}

export function getCardState(learning: LearningStore | null, cardId: string): CardLearningState {
  return (
    learning?.cards[cardId] ?? {
      cardId,
      status: 'new',
      favorite: false,
      confidence: 0,
      box: 0,
      nextReviewAt: null,
      lastReviewedAt: null,
      note: '',
      reviewCount: 0,
      updatedAt: new Date(0).toISOString()
    }
  )
}

export function filterCards(
  cards: KnowledgeCard[],
  learning: LearningStore | null,
  filters: CardFilters
): KnowledgeCard[] {
  return searchKnowledgeCards(cards, filters.query, {
    projects: filters.project ? [filters.project] : undefined,
    domains: filters.domain ? [filters.domain] : undefined,
    verifications: filters.verification ? [filters.verification] : undefined,
    minLearningValue: filters.learningValue ? Number(filters.learningValue) : undefined,
    minInterviewValue: filters.interviewValue ? Number(filters.interviewValue) : undefined
  })
    .map((result) => result.card)
    .filter((card) => {
      const state = getCardState(learning, card.id)
      if (filters.mastery && state.status !== filters.mastery) return false
      if (filters.favoriteOnly && !state.favorite) return false
      const createdAt = card.createdAt.slice(0, 10)
      if (filters.dateFrom && createdAt < filters.dateFrom) return false
      if (filters.dateTo && createdAt > filters.dateTo) return false
      return true
    })
}

function priority(card: KnowledgeCard, learning: LearningStore): number {
  const state = getCardState(learning, card.id)
  const settings = learning.settings
  let value = card.learningValue * 5 + card.interviewValue * 6 + card.experienceScore * 2
  if (settings.focusProjects.includes(card.project)) value += 18
  if (settings.focusDomains.includes(card.domain)) value += 16
  if (state.confidence > 0) value += (5 - state.confidence) * 4
  if (state.favorite) value += 5
  return value
}

export function buildTodayQueue(snapshot: KnowledgeSnapshot | null, learning: LearningStore | null): KnowledgeCard[] {
  if (!snapshot || !learning) return []
  const due = snapshot.cards
    .filter((card) => isDue(learning.cards[card.id]))
    .sort((a, b) => {
      const aDate = learning.cards[a.id]?.nextReviewAt ?? ''
      const bDate = learning.cards[b.id]?.nextReviewAt ?? ''
      return aDate.localeCompare(bDate) || priority(b, learning) - priority(a, learning)
    })
  const dueIds = new Set(due.map((card) => card.id))
  const fresh = snapshot.cards
    .filter((card) => !dueIds.has(card.id) && getCardState(learning, card.id).status === 'new')
    .sort((a, b) => priority(b, learning) - priority(a, learning))
    .slice(0, Math.max(0, learning.settings.dailyNewCards || 3))
  return [...due, ...fresh]
}

export function calculateStreak(studyDays: string[]): number {
  const unique = new Set(studyDays)
  let cursor = new Date()
  if (!unique.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (unique.has(localDayKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export function previousDays(studyDays: string[], count = 14): Array<{ key: string; label: string; active: boolean }> {
  const source = new Set(studyDays)
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date()
    date.setDate(date.getDate() - (count - 1 - offset))
    return {
      key: localDayKey(date),
      label: new Intl.DateTimeFormat('zh-CN', { weekday: 'narrow' }).format(date),
      active: source.has(localDayKey(date))
    }
  })
}

export function masteryCounts(snapshot: KnowledgeSnapshot | null, learning: LearningStore | null): Record<string, number> {
  const result = { new: 0, learning: 0, reviewing: 0, mastered: 0 }
  for (const card of snapshot?.cards ?? []) {
    const key = getCardState(learning, card.id).status
    result[key] += 1
  }
  return result
}

export function weakDomains(snapshot: KnowledgeSnapshot | null, learning: LearningStore | null): Array<{
  domain: string
  total: number
  mastered: number
  confidence: number
  ratio: number
}> {
  if (!snapshot) return []
  const grouped = new Map<string, KnowledgeCard[]>()
  for (const card of snapshot.cards) grouped.set(card.domain || '未分类', [...(grouped.get(card.domain || '未分类') ?? []), card])
  return Array.from(grouped.entries())
    .map(([domain, cards]) => {
      const states = cards.map((card) => getCardState(learning, card.id))
      const mastered = states.filter((state) => state.status === 'mastered').length
      const confidence = states.reduce((sum, state) => sum + state.confidence, 0) / Math.max(1, states.length)
      return { domain, total: cards.length, mastered, confidence, ratio: mastered / cards.length }
    })
    .sort((a, b) => a.ratio - b.ratio || b.total - a.total)
}

export function interviewCards(snapshot: KnowledgeSnapshot | null): KnowledgeCard[] {
  return [...(snapshot?.cards ?? [])]
    .filter((card) => card.interviewValue > 0 || card.sections.some((section) => /面试|interview/i.test(section.title)))
    .sort((a, b) => b.interviewValue - a.interviewValue || b.experienceScore - a.experienceScore)
}

function findSection(card: KnowledgeCard, patterns: RegExp[]): string {
  return card.sections.find((section) => patterns.some((pattern) => pattern.test(section.title)))?.content.trim() ?? ''
}

export interface InterviewMaterial {
  question: string
  shortAnswer: string
  longAnswer: string
  followUps: string
}

export function extractInterviewMaterial(card: KnowledgeCard): InterviewMaterial {
  const interview = findSection(card, [/面试提炼/i, /interview/i])
  const question = findSection(card, [/面试问题/i, /问题.*面试/i]) || firstMeaningfulLine(interview) || `请介绍你在「${card.title}」中的问题定位与解决过程。`
  const shortAnswer = findSection(card, [/30\s*秒/i, /简短回答/i]) || findSection(card, [/最终解决方案/i, /solution/i])
  const longAnswer = findSection(card, [/2\s*分钟/i, /STAR/i, /完整回答/i]) || interview || findSection(card, [/经验教训/i, /lessons/i])
  const followUps = findSection(card, [/追问/i, /follow.?up/i])
  return {
    question: stripMarkdown(question),
    shortAnswer: shortAnswer || '该卡片暂未提供 30 秒回答，请依据问题、根因、方案和验证四部分进行概括。',
    longAnswer: longAnswer || '该卡片暂未提供完整面试稿，可按背景、任务、行动、结果和复盘组织回答。',
    followUps: followUps || '可以继续说明：如何验证根因、为何选择该方案、如何避免复发。'
  }
}

function firstMeaningfulLine(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*#>\s]+/, '').trim())
    .find((line) => line.length > 8) ?? ''
}

export function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[`*_>#\[\]]/g, '')
    .replace(/\((https?:\/\/[^)]+)\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function groupBy<T>(items: T[], selector: (item: T) => string): Array<[string, T[]]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = selector(item) || '未分类'
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return Array.from(groups.entries())
}

export function docsByKind(snapshot: KnowledgeSnapshot | null, kinds: KnowledgeDocument['kind'][]): KnowledgeDocument[] {
  return [...(snapshot?.documents ?? [])]
    .filter((doc) => kinds.includes(doc.kind))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function completionRatio(snapshot: KnowledgeSnapshot | null, learning: LearningStore | null): number {
  const total = snapshot?.cards.length ?? 0
  if (!total) return 0
  const mastered = (snapshot?.cards ?? []).filter((card) => getCardState(learning, card.id).status === 'mastered').length
  return Math.round((mastered / total) * 100)
}

export function settingsSummary(settings: AppSettings | undefined): string {
  if (!settings) return '每日 20 分钟'
  const days = daysUntil(settings.interviewDate)
  return days === null ? `每日 ${settings.dailyMinutes} 分钟` : `距面试 ${Math.max(0, days)} 天 · 每日 ${settings.dailyMinutes} 分钟`
}

export function sprintPlan(snapshot: KnowledgeSnapshot | null, learning: LearningStore | null): Array<{
  day: number
  date: string
  theme: string
  cardIds: string[]
  complete: boolean
}> {
  if (!snapshot || !learning) return []
  const weak = weakDomains(snapshot, learning)
  const ranked = interviewCards(snapshot)
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() + index)
    const theme = weak[index % Math.max(1, weak.length)]?.domain ?? '综合复盘'
    const cards = ranked
      .filter((card) => card.domain === theme || index > weak.length)
      .slice((index * 2) % Math.max(1, ranked.length), ((index * 2) % Math.max(1, ranked.length)) + 2)
    const fallback = cards.length ? cards : ranked.slice(index % Math.max(1, ranked.length), (index % Math.max(1, ranked.length)) + 2)
    return {
      day: index + 1,
      date: localDayKey(date),
      theme,
      cardIds: fallback.map((card) => card.id),
      complete: fallback.length > 0 && fallback.every((card) => getCardState(learning, card.id).reviewCount > 0)
    }
  })
}

export function uniqueValues(cards: KnowledgeCard[], selector: (card: KnowledgeCard) => string): string[] {
  return Array.from(new Set(cards.map(selector).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
