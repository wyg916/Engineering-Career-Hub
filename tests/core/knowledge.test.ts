import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  buildKnowledgeSnapshot,
  parseKnowledgeMarkdown,
  scanKnowledgeRoot
} from '../../src/core/knowledge'

const VALID_CARD = `---
id: EXP-TEST-20260829-001
title: "中文权限问题"
created_at: "2026-08-20T09:00:00+08:00"
updated_at: "2026-08-29T09:00:00+08:00"
project: "示例项目"
domain: security
type: debug
status: solved
verification: verified
impact: "3"
diagnosis_depth: 2
technical_depth: 3
experience_score: 12
difficulty: 4
learning_value: 5
interview_value: 4
reusability: 5
tags: [权限, 多租户]
related: EXP-SECURITY-20260820-001, EXP-TEST-20260821-001
---

# EXP-TEST-20260829-001：中文权限问题

## 1. 背景与目标

需要验证 **权限边界**。

## 2. 问题表现

### 预期

用户只能看到自己的数据。

### 实际

用户看到了其他租户的数据。

## 4. 根因

查询缺少 tenant_id 条件。

## 12. 面试提炼

### 可被问到的问题

如何保证多租户隔离？
`

const temporaryRoots: string[] = []

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    if (path.resolve(root).startsWith(path.resolve(tmpdir()))) {
      await rm(root, { recursive: true, force: true })
    }
  }
})

describe('parseKnowledgeMarkdown', () => {
  it('normalizes YAML metadata, dates, arrays and standard sections', () => {
    const result = parseKnowledgeMarkdown(
      VALID_CARD,
      '01_原始经验卡片/安全与权限/EXP-TEST-20260829-001.md',
      '2026-08-29T01:00:00.000Z'
    )

    expect(result.diagnostics).toEqual([])
    expect(result.card).toMatchObject({
      id: 'EXP-TEST-20260829-001',
      title: '中文权限问题',
      project: '示例项目',
      domain: 'SECURITY',
      impact: 3,
      learningValue: 5,
      tags: ['权限', '多租户'],
      related: ['EXP-SECURITY-20260820-001', 'EXP-TEST-20260821-001']
    })
    expect(result.card?.sections.map((section) => section.title)).toContain('背景与目标')
    expect(result.card?.sections.map((section) => section.title)).toContain('面试提炼')
    expect(result.card?.sections.find((section) => section.title === '问题表现')?.content).toContain('用户看到了其他租户的数据')
    expect(result.card?.plainText).toContain('权限边界')
    expect(result.card?.plainText).not.toContain('**')
  })

  it('reports invalid or missing frontmatter without throwing or creating an unsafe card', () => {
    const invalid = parseKnowledgeMarkdown(
      '---\ntitle: [未闭合\n---\n# 错误卡片',
      '01_原始经验卡片/测试/invalid.md'
    )
    const missing = parseKnowledgeMarkdown('# 没有元数据', '01_原始经验卡片/测试/missing.md')

    expect(invalid.card).toBeUndefined()
    expect(invalid.diagnostics[0]?.severity).toBe('error')
    expect(missing.card).toBeUndefined()
    expect(missing.diagnostics[0]?.message).toContain('缺少 YAML frontmatter')
  })

  it('keeps non-card Markdown readable even when its optional YAML is invalid', () => {
    const result = parseKnowledgeMarkdown(
      '---\ntitle: [坏 YAML\n---\n# 项目索引\n\n正文',
      '02_项目经历索引/示例项目.md',
      '2026-08-29T01:00:00.000Z'
    )

    expect(result.document?.kind).toBe('project')
    expect(result.document?.plainText).toContain('正文')
    expect(result.diagnostics[0]?.severity).toBe('error')
  })
})

describe('knowledge snapshot', () => {
  it('calculates deterministic stats and rejects duplicate card IDs', () => {
    const snapshot = buildKnowledgeSnapshot('C:/knowledge', [
      { relativePath: '01_原始经验卡片/测试/a.md', markdown: VALID_CARD },
      { relativePath: '01_原始经验卡片/测试/b.md', markdown: VALID_CARD },
      { relativePath: '04_面试知识库/候选案例索引.md', markdown: '# 面试候选案例' }
    ], '2026-08-29T01:00:00.000Z')

    expect(snapshot.stats).toMatchObject({
      cardCount: 1,
      projectCount: 1,
      domainCount: 1,
      interviewCandidateCount: 1,
      documentCount: 1
    })
    expect(snapshot.diagnostics.some((item) => item.message.includes('重复'))).toBe(true)
  })

  it('scans only the five user-facing roots and never follows excluded system/template content', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'experience-study-core-'))
    temporaryRoots.push(root)
    const paths = [
      '01_原始经验卡片/测试',
      '02_项目经历索引',
      '04_面试知识库',
      '05_阶段复盘',
      '06_待学习知识',
      '90_模板',
      '99_系统/logs'
    ]
    await Promise.all(paths.map((entry) => mkdir(path.join(root, entry), { recursive: true })))
    await writeFile(path.join(root, '01_原始经验卡片/测试/card.md'), VALID_CARD, 'utf8')
    await writeFile(path.join(root, '02_项目经历索引/project.md'), '# 项目索引', 'utf8')
    await writeFile(path.join(root, '04_面试知识库/interview.md'), '# 面试索引', 'utf8')
    await writeFile(path.join(root, '05_阶段复盘/review.md'), '# 周报', 'utf8')
    await writeFile(path.join(root, '06_待学习知识/learning.md'), '# 待学习', 'utf8')
    await writeFile(path.join(root, '90_模板/secret.md'), VALID_CARD, 'utf8')
    await writeFile(path.join(root, '99_系统/logs/receipt.md'), '# receipt', 'utf8')

    const snapshot = await scanKnowledgeRoot(root)

    expect(snapshot.cards).toHaveLength(1)
    expect(snapshot.documents).toHaveLength(4)
    expect(snapshot.documents.map((item) => item.kind).sort()).toEqual(['interview', 'learning', 'project', 'review'])
    expect(snapshot.cards[0]?.relativePath).toMatch(/^01_原始经验卡片\//)
    expect(snapshot.documents.every((item) => !item.relativePath.startsWith('90_') && !item.relativePath.startsWith('99_'))).toBe(true)
  })
})
