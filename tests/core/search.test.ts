import { describe, expect, it } from 'vitest'

import { findHighlightRanges, searchCards } from '../../src/core/search'
import type { KnowledgeCard } from '../../src/shared/types'

function card(overrides: Partial<KnowledgeCard>): KnowledgeCard {
  return {
    id: 'EXP-TEST-001',
    title: '默认标题',
    createdAt: '2026-08-20T00:00:00Z',
    updatedAt: '2026-08-20T00:00:00Z',
    project: '默认项目',
    domain: 'TEST',
    type: 'debug',
    status: 'solved',
    verification: 'verified',
    impact: 3,
    diagnosisDepth: 3,
    technicalDepth: 3,
    experienceScore: 12,
    difficulty: 3,
    learningValue: 4,
    interviewValue: 4,
    reusability: 4,
    tags: [],
    related: [],
    sections: [],
    markdown: '',
    plainText: '',
    relativePath: '01_原始经验卡片/测试/default.md',
    ...overrides
  }
}

const CARDS = [
  card({
    id: 'EXP-NL2SQL-001',
    title: 'TopN 并列值下建立稳定全序',
    project: 'ChatBI',
    domain: 'NL2SQL',
    tags: ['TopN', 'SQL'],
    plainText: '并列结果需要稳定实体键。'
  }),
  card({
    id: 'EXP-SECURITY-001',
    title: '多租户权限隔离必须沿所有权过滤',
    project: '运营平台',
    domain: 'SECURITY',
    tags: ['权限', '多租户'],
    plainText: '前端隐藏并不能替代服务端权限校验。',
    interviewValue: 5
  }),
  card({
    id: 'EXP-RAG-001',
    title: 'RAG 检索质量的分层门禁',
    project: '知识助手',
    domain: 'RAG',
    tags: ['RAG', '召回率'],
    plainText: '检索、重排和生成需要分别验收。'
  })
]

describe('searchCards', () => {
  it('ranks exact title/tag and Chinese substring matches above body-only matches', () => {
    expect(searchCards(CARDS, 'TopN')[0]?.card.id).toBe('EXP-NL2SQL-001')
    expect(searchCards(CARDS, '权限')[0]?.card.id).toBe('EXP-SECURITY-001')
    expect(searchCards(CARDS, 'RAG')[0]?.card.id).toBe('EXP-RAG-001')
  })

  it('uses CJK fuzzy fallback for a small typo', () => {
    const results = searchCards(CARDS, '权限隔里')
    expect(results[0]?.card.id).toBe('EXP-SECURITY-001')
    expect(results[0]?.score).toBeGreaterThan(0)
  })

  it('applies metadata and value filters independently of query text', () => {
    const results = searchCards(CARDS, '', { domains: ['security'], minInterviewValue: 5 })
    expect(results.map((result) => result.card.id)).toEqual(['EXP-SECURITY-001'])
  })

  it('returns exact highlight offsets without emitting markup', () => {
    expect(findHighlightRanges('权限校验与权限隔离', '权限')).toEqual([
      { start: 0, end: 2 },
      { start: 5, end: 7 }
    ])
  })
})
