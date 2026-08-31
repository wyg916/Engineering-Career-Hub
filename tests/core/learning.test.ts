import { describe, expect, it } from 'vitest'

import {
  applyLearningAction,
  buildDailyQueue,
  buildInterviewPlan,
  buildInterviewQueue,
  createDefaultLearningStore,
  validateLearningStore
} from '../../src/core/learning'
import type { KnowledgeCard, LearningStore } from '../../src/shared/types'

const NOW = '2026-08-29T08:00:00.000Z'

function card(id: string, overrides: Partial<KnowledgeCard> = {}): KnowledgeCard {
  return {
    id,
    title: id,
    createdAt: NOW,
    updatedAt: NOW,
    project: '普通项目',
    domain: 'TEST',
    type: 'debug',
    status: 'solved',
    verification: 'verified',
    impact: 3,
    diagnosisDepth: 3,
    technicalDepth: 3,
    experienceScore: 12,
    difficulty: 3,
    learningValue: 3,
    interviewValue: 3,
    reusability: 3,
    tags: [],
    related: [],
    sections: [],
    markdown: '',
    plainText: '',
    relativePath: `01_原始经验卡片/测试/${id}.md`,
    ...overrides
  }
}

describe('Leitner reducer', () => {
  it('uses six boxes with 0/1/3/7/14/30 day semantics and preserves the input store', () => {
    const original = createDefaultLearningStore(NOW)
    const confident = applyLearningAction(original, { type: 'set-confidence', cardId: 'A', confidence: 4 })
    const first = applyLearningAction(confident, { type: 'review', cardId: 'A', rating: 'easy', mode: 'study', now: NOW })
    const second = applyLearningAction(first, { type: 'review', cardId: 'A', rating: 'easy', mode: 'study', now: NOW })
    const third = applyLearningAction(second, { type: 'review', cardId: 'A', rating: 'easy', mode: 'interview', now: NOW })

    expect(original.cards.A).toBeUndefined()
    expect(first.cards.A).toMatchObject({ box: 2, nextReviewAt: '2026-09-01T08:00:00.000Z', status: 'reviewing' })
    expect(second.cards.A).toMatchObject({ box: 4, nextReviewAt: '2026-09-12T08:00:00.000Z' })
    expect(third.cards.A).toMatchObject({ box: 5, nextReviewAt: '2026-09-28T08:00:00.000Z', status: 'mastered' })
    expect(third.reviews).toHaveLength(3)
    expect(third.studyDays).toEqual(['2026-08-29'])
  })

  it('resets forgotten cards immediately and schedules hard cards for the next day', () => {
    const base = validateLearningStore({
      version: 1,
      settings: createDefaultLearningStore().settings,
      cards: {
        A: { cardId: 'A', box: 4, confidence: 3, status: 'reviewing' },
        B: { cardId: 'B', box: 3, confidence: 2, status: 'reviewing' }
      },
      reviews: [],
      studyDays: []
    }, NOW)

    const forgotten = applyLearningAction(base, { type: 'review', cardId: 'A', rating: 'again', mode: 'study', now: NOW })
    const hard = applyLearningAction(base, { type: 'review', cardId: 'B', rating: 'hard', mode: 'study', now: NOW })

    expect(forgotten.cards.A).toMatchObject({ box: 0, nextReviewAt: NOW })
    expect(hard.cards.B).toMatchObject({ box: 2, nextReviewAt: '2026-08-30T08:00:00.000Z' })
  })
})

describe('learning queues', () => {
  it('puts every due review first, then at most three prioritized new cards', () => {
    let store = createDefaultLearningStore(NOW)
    store = applyLearningAction(store, {
      type: 'update-settings',
      patch: { dailyNewCards: 3, focusProjects: ['重点项目'], focusDomains: ['RAG'] }
    })
    store = validateLearningStore({
      ...store,
      cards: {
        dueA: { cardId: 'dueA', status: 'reviewing', box: 2, nextReviewAt: '2026-08-28T08:00:00.000Z' },
        dueB: { cardId: 'dueB', status: 'reviewing', box: 1, nextReviewAt: NOW }
      }
    }, NOW)
    const cards = [
      card('new-low'),
      card('new-focus', { project: '重点项目', domain: 'RAG' }),
      card('new-high', { learningValue: 5, interviewValue: 5 }),
      card('new-fourth'),
      card('dueA'),
      card('dueB')
    ]

    const queue = buildDailyQueue(cards, store, NOW)

    expect(queue.slice(0, 2).map((entry) => entry.reason)).toEqual(['due', 'due'])
    expect(queue).toHaveLength(5)
    expect(queue.slice(2).map((entry) => entry.card.id)).toContain('new-focus')
  })

  it('uses only existing interview sections and creates a deterministic 14-day plan', () => {
    const interviewSection = [{ level: 2, title: '面试提炼', slug: 'interview', content: '问题与回答' }]
    const cards = [
      card('has-interview', { interviewValue: 5, sections: interviewSection }),
      card('no-interview', { interviewValue: 5 })
    ]
    const store = createDefaultLearningStore(NOW)

    expect(buildInterviewQueue(cards, store, { now: NOW }).map((entry) => entry.card.id)).toEqual(['has-interview'])
    const plan = buildInterviewPlan(cards, store, NOW)
    expect(plan).toHaveLength(14)
    expect(plan[0]).toMatchObject({ date: '2026-08-29' })
    expect(plan[0]?.cards[0]?.card.id).toBe('has-interview')
  })
})

describe('validateLearningStore', () => {
  it('repairs malformed persisted state and drops invalid review events', () => {
    const result: LearningStore = validateLearningStore({
      version: 99,
      settings: { dailyMinutes: -10, dailyNewCards: 500, theme: 'unknown', focusProjects: ['A', 'A'] },
      cards: { A: { status: 'bad', box: 99, confidence: -2, reviewCount: -3 } },
      reviews: [{ id: 'bad' }],
      studyDays: ['2026-08-29', 'not-a-date']
    }, NOW)

    expect(result.version).toBe(1)
    expect(result.settings).toMatchObject({ dailyMinutes: 5, dailyNewCards: 30, theme: 'system', focusProjects: ['A'] })
    expect(result.cards.A).toMatchObject({ status: 'new', box: 5, confidence: 0, reviewCount: 0 })
    expect(result.reviews).toEqual([])
    expect(result.studyDays).toEqual(['2026-08-29'])
  })
})
