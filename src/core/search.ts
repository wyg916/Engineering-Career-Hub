import type { KnowledgeCard } from '../shared/types'

export interface KnowledgeSearchOptions {
  projects?: string[]
  domains?: string[]
  tags?: string[]
  statuses?: string[]
  verifications?: string[]
  minLearningValue?: number
  minInterviewValue?: number
  limit?: number
}

export interface KnowledgeSearchResult {
  card: KnowledgeCard
  score: number
  matchedFields: string[]
}

export interface HighlightRange {
  start: number
  end: number
}

interface WeightedField {
  name: string
  value: string
  normalized: string
  compact: string
  weight: number
}

const fieldCache = new WeakMap<KnowledgeCard, WeightedField[]>()

export interface KnowledgeSearchIndex {
  readonly cards: KnowledgeCard[]
  readonly cjk: ReadonlyMap<string, ReadonlySet<number>>
  readonly ascii: ReadonlyMap<string, ReadonlySet<number>>
}

const indexCache = new WeakMap<KnowledgeCard[], KnowledgeSearchIndex>()

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}+#.]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compact(value: string): string {
  return normalizeSearchText(value).replaceAll(' ', '')
}

function normalizedSet(values: string[] | undefined): Set<string> | null {
  if (!values || values.length === 0) return null
  return new Set(values.map(normalizeSearchText).filter(Boolean))
}

function matchesFilters(card: KnowledgeCard, options: KnowledgeSearchOptions): boolean {
  const projects = normalizedSet(options.projects)
  const domains = normalizedSet(options.domains)
  const tags = normalizedSet(options.tags)
  const statuses = normalizedSet(options.statuses)
  const verifications = normalizedSet(options.verifications)

  if (projects && !projects.has(normalizeSearchText(card.project))) return false
  if (domains && !domains.has(normalizeSearchText(card.domain))) return false
  if (statuses && !statuses.has(normalizeSearchText(card.status))) return false
  if (verifications && !verifications.has(normalizeSearchText(card.verification))) return false
  if (tags && !card.tags.some((tag) => tags.has(normalizeSearchText(tag)))) return false
  if (options.minLearningValue != null && card.learningValue < options.minLearningValue) return false
  if (options.minInterviewValue != null && card.interviewValue < options.minInterviewValue) return false
  return true
}

function cardFields(card: KnowledgeCard): WeightedField[] {
  const cached = fieldCache.get(card)
  if (cached) return cached
  const source: Array<[string, string, number]> = [
    ['title', card.title, 14],
    ['id', card.id, 9],
    ['tags', card.tags.join(' '), 10],
    ['project', card.project, 7],
    ['domain', card.domain, 7],
    ['section', card.sections.map((section) => section.title).join(' '), 5],
    ['body', card.plainText, 1]
  ]
  const fields = source.map(([name, value, weight]) => {
    const normalized = normalizeSearchText(value)
    return { name, value, normalized, compact: normalized.replaceAll(' ', ''), weight }
  })
  fieldCache.set(card, fields)
  return fields
}

function queryTokens(query: string): string[] {
  const tokens = normalizeSearchText(query).match(/[a-z0-9+#.]+|\p{Script=Han}+/gu) ?? []
  return [...new Set(tokens.filter((token) => token.length > 0))]
}

function cjkNgrams(value: string): Set<string> {
  const grams = new Set<string>()
  for (const segment of value.match(/\p{Script=Han}+/gu) ?? []) {
    if (segment.length === 1) {
      grams.add(segment)
      continue
    }
    for (const size of [2, 3]) {
      if (segment.length < size) continue
      for (let index = 0; index <= segment.length - size; index += 1) {
        grams.add(segment.slice(index, index + size))
      }
    }
  }
  return grams
}

function addPosting(index: Map<string, Set<number>>, key: string, cardIndex: number): void {
  const posting = index.get(key)
  if (posting) posting.add(cardIndex)
  else index.set(key, new Set([cardIndex]))
}

export function createKnowledgeSearchIndex(cards: KnowledgeCard[]): KnowledgeSearchIndex {
  const cjk = new Map<string, Set<number>>()
  const ascii = new Map<string, Set<number>>()
  cards.forEach((card, cardIndex) => {
    const searchable = cardFields(card).map((field) => field.normalized).join(' ')
    for (const gram of cjkNgrams(searchable)) addPosting(cjk, gram, cardIndex)
    for (const token of searchable.match(/[a-z0-9+#.]+/g) ?? []) addPosting(ascii, token, cardIndex)
  })
  const result: KnowledgeSearchIndex = { cards, cjk, ascii }
  indexCache.set(cards, result)
  return result
}

function candidateIndexes(index: KnowledgeSearchIndex, query: string): number[] {
  const matchCounts = new Map<number, number>()
  let matchedQueryParts = 0
  for (const gram of cjkNgrams(query)) {
    const posting = index.cjk.get(gram)
    if (!posting) continue
    matchedQueryParts += 1
    for (const cardIndex of posting) matchCounts.set(cardIndex, (matchCounts.get(cardIndex) ?? 0) + 1)
  }
  for (const token of query.match(/[a-z0-9+#.]+/g) ?? []) {
    const posting = index.ascii.get(token)
    if (!posting) continue
    matchedQueryParts += 1
    for (const cardIndex of posting) matchCounts.set(cardIndex, (matchCounts.get(cardIndex) ?? 0) + 1)
  }
  if (matchedQueryParts === 0) return index.cards.map((_, cardIndex) => cardIndex)

  // Prefer documents matching the largest portion of a multi-gram query. This
  // keeps common grams such as “权限” from widening “权限隔离” to most of the KB,
  // while still allowing a one-gram miss for a small typo.
  const bestCount = Math.max(...matchCounts.values())
  return [...matchCounts.entries()]
    .filter(([, count]) => count === bestCount)
    .map(([cardIndex]) => cardIndex)
}

function gramCoverageInText(grams: Set<string>, compactText: string): number {
  if (grams.size === 0 || compactText.length === 0) return 0
  let overlap = 0
  for (const gram of grams) if (compactText.includes(gram)) overlap += 1
  return overlap / grams.size
}

function boundedEditDistance(left: string, right: string, maximum: number): number {
  if (Math.abs(left.length - right.length) > maximum) return maximum + 1
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    let rowMinimum = current[0] ?? maximum + 1
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = (previous[rightIndex - 1] ?? 0)
        + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      const value = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        substitution
      )
      current[rightIndex] = value
      rowMinimum = Math.min(rowMinimum, value)
    }
    if (rowMinimum > maximum) return maximum + 1
    previous = current
  }
  return previous[right.length] ?? maximum + 1
}

function bestFuzzySimilarity(query: string, field: string): number {
  const normalizedQuery = compact(query)
  const segments = normalizeSearchText(field).match(/[a-z0-9+#.]+|\p{Script=Han}+/gu) ?? []
  if (normalizedQuery.length < 2 || segments.length === 0) return 0

  const maximumDistance = normalizedQuery.length >= 6 ? 2 : 1
  let best = 0

  for (const segment of segments) {
    if (segment.length >= normalizedQuery.length) {
      for (let index = 0; index <= segment.length - normalizedQuery.length; index += 1) {
        let differences = 0
        for (let offset = 0; offset < normalizedQuery.length; offset += 1) {
          if (normalizedQuery[offset] !== segment[index + offset]) differences += 1
          if (differences > maximumDistance) break
        }
        if (differences <= maximumDistance) {
          best = Math.max(best, 1 - differences / normalizedQuery.length)
          if (best === 1) return best
        }
      }
    } else if (normalizedQuery.length - segment.length <= maximumDistance) {
      const distance = boundedEditDistance(normalizedQuery, segment, maximumDistance)
      if (distance <= maximumDistance) best = Math.max(best, 1 - distance / normalizedQuery.length)
    }
  }
  return best
}

function scoreField(
  field: WeightedField,
  normalizedQuery: string,
  compactQuery: string,
  tokens: string[],
  queryGrams: Set<string>
): number {
  const value = field.normalized
  if (!value) return 0
  const compactValue = field.compact
  let score = 0

  if (value === normalizedQuery || compactValue === compactQuery) {
    score += field.weight * 12
  } else if (value.includes(normalizedQuery) || compactValue.includes(compactQuery)) {
    score += field.weight * 7
  }

  for (const token of tokens) {
    if (!token) continue
    if (compactValue === token) score += field.weight * 4
    else if (compactValue.includes(token)) score += field.weight * 2
  }

  // The query normally contains only a handful of CJK n-grams. Checking those
  // directly avoids allocating an enormous n-gram Set for every full card body.
  const gramOverlap = gramCoverageInText(queryGrams, compactValue)
  if (gramOverlap > 0) score += field.weight * 2.5 * gramOverlap

  // Fuzzy edit-distance is useful for labels, but applying a sliding window to
  // long Markdown bodies makes a 1,000-card search unnecessarily quadratic.
  if (score === 0 && field.name !== 'body' && compactValue.length <= 500) {
    const fuzzy = bestFuzzySimilarity(normalizedQuery, field.value)
    if (fuzzy >= 0.66) score += field.weight * fuzzy
  }
  return score
}

export function searchCards(
  cards: KnowledgeCard[],
  query: string,
  options: KnowledgeSearchOptions = {}
): KnowledgeSearchResult[] {
  const normalizedQuery = normalizeSearchText(query)
  const compactQuery = normalizedQuery.replaceAll(' ', '')
  const limit = Math.max(0, Math.floor(options.limit ?? cards.length))

  if (!normalizedQuery) {
    return cards
      .filter((card) => matchesFilters(card, options))
      .map((card) => ({ card, score: 0, matchedFields: [] }))
      .sort((left, right) =>
        right.card.interviewValue - left.card.interviewValue
        || right.card.learningValue - left.card.learningValue
        || left.card.title.localeCompare(right.card.title, 'zh-CN'))
      .slice(0, limit)
  }

  const tokens = queryTokens(normalizedQuery).map((token) => token.replaceAll(' ', ''))
  const queryGrams = cjkNgrams(normalizedQuery)
  const index = indexCache.get(cards) ?? createKnowledgeSearchIndex(cards)
  return candidateIndexes(index, normalizedQuery)
    .map((cardIndex) => cards[cardIndex])
    .filter((card): card is KnowledgeCard => card !== undefined && matchesFilters(card, options))
    .map((card) => {
      const matches = cardFields(card)
        .map((field) => ({
          field: field.name,
          score: scoreField(field, normalizedQuery, compactQuery, tokens, queryGrams)
        }))
        .filter((entry) => entry.score > 0)
      return {
        card,
        score: matches.reduce((sum, entry) => sum + entry.score, 0),
        matchedFields: matches.map((entry) => entry.field)
      }
    })
    .filter((result) => result.score > 0)
    .sort((left, right) =>
      right.score - left.score
      || right.card.interviewValue - left.card.interviewValue
      || right.card.learningValue - left.card.learningValue
      || left.card.title.localeCompare(right.card.title, 'zh-CN'))
    .slice(0, limit)
}

export function findHighlightRanges(text: string, query: string): HighlightRange[] {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery || /\s/.test(normalizedQuery)) return []

  const ranges: HighlightRange[] = []
  const normalizedText = text.normalize('NFKC').toLocaleLowerCase()
  let start = 0
  while (start < normalizedText.length) {
    const index = normalizedText.indexOf(normalizedQuery, start)
    if (index < 0) break
    ranges.push({ start: index, end: index + normalizedQuery.length })
    start = index + normalizedQuery.length
  }
  return ranges
}
