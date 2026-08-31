import type {
  AppSettings,
  CardLearningState,
  KnowledgeCard,
  LearningAction,
  LearningStatus,
  LearningStore,
  ReviewEvent,
  ReviewRating,
  ThemeMode
} from '../shared/types'

export const LEITNER_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30] as const

export interface StudyQueueEntry {
  card: KnowledgeCard
  state: CardLearningState
  reason: 'due' | 'new'
  priority: number
}

export interface DailyQueueOptions {
  newCardLimit?: number
}

export interface InterviewQueueOptions {
  limit?: number
  onlyDue?: boolean
  now?: string
}

export interface InterviewPlanDay {
  date: string
  cards: StudyQueueEntry[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isoNow(value?: string): string {
  if (value && Number.isFinite(Date.parse(value))) return value
  return new Date().toISOString()
}

function nullableIso(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null
}

function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)))
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean))]
}

function dateKey(value: string): string {
  return /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0] ?? new Date(value).toISOString().slice(0, 10)
}

function addDays(value: string, days: number): string {
  const date = new Date(isoNow(value))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

function defaultSettings(): AppSettings {
  return {
    knowledgeRoot: null,
    onboardingCompleted: false,
    theme: 'system',
    fontScale: 1,
    wideReading: false,
    dailyMinutes: 20,
    dailyNewCards: 3,
    interviewDate: null,
    focusProjects: [],
    focusDomains: []
  }
}

function normalizeSettings(value: unknown, fallback: AppSettings = defaultSettings()): AppSettings {
  const input = isRecord(value) ? value : {}
  const validThemes: ThemeMode[] = ['light', 'dark', 'system']
  const theme = validThemes.includes(input.theme as ThemeMode) ? input.theme as ThemeMode : fallback.theme
  return {
    knowledgeRoot: typeof input.knowledgeRoot === 'string'
      ? input.knowledgeRoot
      : input.knowledgeRoot === null
        ? null
        : fallback.knowledgeRoot,
    onboardingCompleted: typeof input.onboardingCompleted === 'boolean'
      ? input.onboardingCompleted
      : fallback.onboardingCompleted,
    theme,
    fontScale: Math.min(1.5, Math.max(0.8, typeof input.fontScale === 'number' ? input.fontScale : fallback.fontScale)),
    wideReading: typeof input.wideReading === 'boolean' ? input.wideReading : fallback.wideReading,
    dailyMinutes: clampInteger(input.dailyMinutes, 5, 240, fallback.dailyMinutes),
    dailyNewCards: clampInteger(input.dailyNewCards, 0, 30, fallback.dailyNewCards),
    interviewDate: nullableIso(input.interviewDate) ?? (
      typeof input.interviewDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.interviewDate)
        ? input.interviewDate
        : fallback.interviewDate
    ),
    focusProjects: input.focusProjects === undefined ? [...fallback.focusProjects] : stringArray(input.focusProjects),
    focusDomains: input.focusDomains === undefined ? [...fallback.focusDomains] : stringArray(input.focusDomains)
  }
}

export function createDefaultCardLearningState(cardId: string, now?: string): CardLearningState {
  const timestamp = isoNow(now)
  return {
    cardId,
    status: 'new',
    favorite: false,
    confidence: 0,
    box: 0,
    nextReviewAt: null,
    lastReviewedAt: null,
    note: '',
    reviewCount: 0,
    updatedAt: timestamp
  }
}

export function createDefaultLearningStore(now?: string): LearningStore {
  void isoNow(now)
  return {
    version: 1,
    settings: defaultSettings(),
    cards: {},
    reviews: [],
    studyDays: [],
    lastBackupAt: null
  }
}

function normalizeCardState(cardId: string, raw: unknown, now: string): CardLearningState {
  if (!isRecord(raw)) return createDefaultCardLearningState(cardId, now)
  const statuses: LearningStatus[] = ['new', 'learning', 'reviewing', 'mastered']
  return {
    cardId,
    status: statuses.includes(raw.status as LearningStatus) ? raw.status as LearningStatus : 'new',
    favorite: raw.favorite === true,
    confidence: clampInteger(raw.confidence, 0, 5, 0),
    box: clampInteger(raw.box, 0, 5, 0),
    nextReviewAt: nullableIso(raw.nextReviewAt),
    lastReviewedAt: nullableIso(raw.lastReviewedAt),
    note: typeof raw.note === 'string' ? raw.note : '',
    reviewCount: clampInteger(raw.reviewCount, 0, Number.MAX_SAFE_INTEGER, 0),
    updatedAt: nullableIso(raw.updatedAt) ?? now
  }
}

function normalizeReviewEvent(raw: unknown): ReviewEvent | null {
  if (!isRecord(raw)) return null
  const ratings: ReviewRating[] = ['again', 'hard', 'good', 'easy']
  if (typeof raw.id !== 'string' || typeof raw.cardId !== 'string') return null
  if (!ratings.includes(raw.rating as ReviewRating)) return null
  const reviewedAt = nullableIso(raw.reviewedAt)
  const nextReviewAt = nullableIso(raw.nextReviewAt)
  if (!reviewedAt || !nextReviewAt) return null
  return {
    id: raw.id,
    cardId: raw.cardId,
    rating: raw.rating as ReviewRating,
    reviewedAt,
    previousBox: clampInteger(raw.previousBox, 0, 5, 0),
    nextBox: clampInteger(raw.nextBox, 0, 5, 0),
    nextReviewAt,
    mode: raw.mode === 'interview' ? 'interview' : 'study'
  }
}

export function validateLearningStore(raw: unknown, now?: string): LearningStore {
  const timestamp = isoNow(now)
  if (!isRecord(raw)) return createDefaultLearningStore(timestamp)

  const cards: Record<string, CardLearningState> = {}
  if (isRecord(raw.cards)) {
    for (const [cardId, value] of Object.entries(raw.cards)) {
      if (cardId.trim()) cards[cardId] = normalizeCardState(cardId, value, timestamp)
    }
  }

  const reviews = Array.isArray(raw.reviews)
    ? raw.reviews.map(normalizeReviewEvent).filter((event): event is ReviewEvent => event !== null)
    : []
  const studyDays = stringArray(raw.studyDays).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort()

  return {
    version: 1,
    settings: normalizeSettings(raw.settings),
    cards,
    reviews,
    studyDays,
    lastBackupAt: nullableIso(raw.lastBackupAt)
  }
}

function nextBoxFor(previousBox: number, rating: ReviewRating): number {
  if (rating === 'again') return 0
  if (rating === 'hard') return Math.max(0, previousBox - 1)
  if (rating === 'easy') return Math.min(5, previousBox + 2)
  return Math.min(5, previousBox + 1)
}

function nextReviewFor(now: string, nextBox: number, rating: ReviewRating): string {
  if (rating === 'again') return now
  if (rating === 'hard') return addDays(now, 1)
  return addDays(now, LEITNER_INTERVAL_DAYS[nextBox] ?? 30)
}

function withCardState(
  store: LearningStore,
  cardId: string,
  now: string,
  update: (state: CardLearningState) => CardLearningState
): LearningStore {
  const current = store.cards[cardId] ?? createDefaultCardLearningState(cardId, now)
  return {
    ...store,
    cards: {
      ...store.cards,
      [cardId]: update(current)
    }
  }
}

export function applyLearningAction(store: LearningStore, action: LearningAction): LearningStore {
  const validStore = validateLearningStore(store)
  const now = action.type === 'review' ? isoNow(action.now) : new Date().toISOString()

  switch (action.type) {
    case 'toggle-favorite':
      return withCardState(validStore, action.cardId, now, (state) => ({
        ...state,
        favorite: !state.favorite,
        updatedAt: now
      }))
    case 'set-note':
      return withCardState(validStore, action.cardId, now, (state) => ({ ...state, note: action.note, updatedAt: now }))
    case 'set-status':
      return withCardState(validStore, action.cardId, now, (state) => ({ ...state, status: action.status, updatedAt: now }))
    case 'set-confidence': {
      const confidence = clampInteger(action.confidence, 0, 5, 0)
      return withCardState(validStore, action.cardId, now, (state) => ({
        ...state,
        confidence,
        status: state.status === 'mastered' && confidence < 4 ? 'reviewing' : state.status,
        updatedAt: now
      }))
    }
    case 'update-settings':
      return { ...validStore, settings: normalizeSettings({ ...validStore.settings, ...action.patch }, validStore.settings) }
    case 'complete-onboarding':
      return {
        ...validStore,
        settings: normalizeSettings({ ...validStore.settings, ...action.patch, onboardingCompleted: true }, validStore.settings)
      }
    case 'review': {
      const current = validStore.cards[action.cardId] ?? createDefaultCardLearningState(action.cardId, now)
      const nextBox = nextBoxFor(current.box, action.rating)
      const nextReviewAt = nextReviewFor(now, nextBox, action.rating)
      const nextState: CardLearningState = {
        ...current,
        status: nextBox === 5 && current.confidence >= 4 ? 'mastered' : 'reviewing',
        box: nextBox,
        nextReviewAt,
        lastReviewedAt: now,
        reviewCount: current.reviewCount + 1,
        updatedAt: now
      }
      const event: ReviewEvent = {
        id: `${action.cardId}:${now}:${nextState.reviewCount}`,
        cardId: action.cardId,
        rating: action.rating,
        reviewedAt: now,
        previousBox: current.box,
        nextBox,
        nextReviewAt,
        mode: action.mode
      }
      return {
        ...validStore,
        cards: { ...validStore.cards, [action.cardId]: nextState },
        reviews: [...validStore.reviews, event],
        studyDays: [...new Set([...validStore.studyDays, dateKey(now)])].sort()
      }
    }
  }
}

function cardPriority(card: KnowledgeCard, state: CardLearningState, settings: AppSettings, now: string): number {
  let score = card.learningValue * 8 + card.interviewValue * 10 + card.experienceScore
  if (settings.focusProjects.includes(card.project)) score += 45
  if (settings.focusDomains.includes(card.domain)) score += 35
  score += (5 - state.confidence) * 7
  if (state.favorite) score += 12

  if (settings.interviewDate) {
    const daysUntilInterview = Math.ceil((Date.parse(settings.interviewDate) - Date.parse(now)) / 86_400_000)
    if (daysUntilInterview <= 14) score += card.interviewValue * 5
  }
  return score
}

function stateFor(store: LearningStore, cardId: string, now: string): CardLearningState {
  return store.cards[cardId] ?? createDefaultCardLearningState(cardId, now)
}

export function buildDailyQueue(
  cards: KnowledgeCard[],
  store: LearningStore,
  now = new Date().toISOString(),
  options: DailyQueueOptions = {}
): StudyQueueEntry[] {
  const timestamp = isoNow(now)
  const safeStore = validateLearningStore(store, timestamp)
  const due: StudyQueueEntry[] = []
  const fresh: StudyQueueEntry[] = []

  for (const card of cards) {
    const state = stateFor(safeStore, card.id, timestamp)
    if (state.status === 'mastered') continue
    const basePriority = cardPriority(card, state, safeStore.settings, timestamp)
    if (state.nextReviewAt && Date.parse(state.nextReviewAt) <= Date.parse(timestamp)) {
      const overdueDays = Math.max(0, Math.floor((Date.parse(timestamp) - Date.parse(state.nextReviewAt)) / 86_400_000))
      due.push({ card, state, reason: 'due', priority: 10_000 + overdueDays * 20 + basePriority })
    } else if (!state.nextReviewAt && state.reviewCount === 0 && (state.status === 'new' || state.status === 'learning')) {
      fresh.push({ card, state, reason: 'new', priority: basePriority })
    }
  }

  const sortQueue = (left: StudyQueueEntry, right: StudyQueueEntry): number =>
    right.priority - left.priority || left.card.title.localeCompare(right.card.title, 'zh-CN')
  due.sort(sortQueue)
  fresh.sort(sortQueue)
  const newCardLimit = clampInteger(options.newCardLimit, 0, 30, safeStore.settings.dailyNewCards)
  return [...due, ...fresh.slice(0, newCardLimit)]
}

function hasInterviewMaterial(card: KnowledgeCard): boolean {
  return card.sections.some((section) => section.title === '面试提炼' && section.content.trim().length > 0)
}

export function buildInterviewQueue(
  cards: KnowledgeCard[],
  store: LearningStore,
  options: InterviewQueueOptions = {}
): StudyQueueEntry[] {
  const timestamp = isoNow(options.now)
  const safeStore = validateLearningStore(store, timestamp)
  const limit = clampInteger(options.limit, 0, 1_000, 20)

  return cards
    .filter(hasInterviewMaterial)
    .map((card): StudyQueueEntry => {
      const state = stateFor(safeStore, card.id, timestamp)
      const due = !state.nextReviewAt || Date.parse(state.nextReviewAt) <= Date.parse(timestamp)
      return {
        card,
        state,
        reason: due ? 'due' : 'new',
        priority: cardPriority(card, state, safeStore.settings, timestamp)
          + card.interviewValue * 25
          - (state.status === 'mastered' ? 40 : 0)
      }
    })
    .filter((entry) => !options.onlyDue || entry.reason === 'due')
    .sort((left, right) =>
      right.priority - left.priority || left.card.title.localeCompare(right.card.title, 'zh-CN'))
    .slice(0, limit)
}

export function buildInterviewPlan(
  cards: KnowledgeCard[],
  store: LearningStore,
  startAt = new Date().toISOString(),
  days = 14
): InterviewPlanDay[] {
  const safeDays = clampInteger(days, 1, 60, 14)
  const queue = buildInterviewQueue(cards, store, { limit: 1_000, now: startAt })
  const result: InterviewPlanDay[] = Array.from({ length: safeDays }, (_, index) => ({
    date: dateKey(addDays(startAt, index)),
    cards: []
  }))
  queue.forEach((entry, index) => result[index % safeDays]?.cards.push(entry))
  return result
}
