import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { KnowledgeService } from '../../src/main/knowledge-service'
import type { KnowledgeSnapshot, RootResolution } from '../../src/shared/types'

const roots: string[] = []

function cardMarkdown(id: string, title: string): string {
  return `---
id: ${id}
title: "${title}"
created_at: "2026-08-29T08:00:00+08:00"
updated_at: "2026-08-29T08:00:00+08:00"
project: "监听测试项目"
domain: TEST
type: debug
status: solved
verification: verified
experience_score: 10
learning_value: 4
interview_value: 3
tags: [监听]
---

# ${title}

## 问题表现

文件监听测试。
`
}

async function waitForSnapshot(
  snapshots: KnowledgeSnapshot[],
  predicate: (snapshot: KnowledgeSnapshot) => boolean,
  timeoutMs = 2_000
): Promise<KnowledgeSnapshot> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const match = snapshots.find(predicate)
    if (match) return match
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25))
  }
  throw new Error(`未在 ${timeoutMs}ms 内收到知识库更新`)
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (resolve(root).startsWith(resolve(tmpdir()))) await rm(root, { recursive: true, force: true })
  }
})

describe('KnowledgeService watcher', () => {
  it('publishes atomic additions and deletions within two seconds', async () => {
    const root = await mkdtemp(join(tmpdir(), 'experience-study-watch-'))
    roots.push(root)
    const cardDirectory = join(root, '01_原始经验卡片', '测试')
    await mkdir(cardDirectory, { recursive: true })
    await writeFile(join(cardDirectory, 'A.md'), cardMarkdown('EXP-WATCH-001', '第一张监听卡'), 'utf8')

    const updates: KnowledgeSnapshot[] = []
    const service = new KnowledgeService((snapshot) => updates.push(snapshot))
    const resolution: RootResolution = { root, source: 'manual', valid: true, message: '测试知识库' }

    try {
      expect((await service.refresh(resolution)).stats.cardCount).toBe(1)
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 150))

      const addedAt = Date.now()
      await writeFile(join(cardDirectory, 'B.md'), cardMarkdown('EXP-WATCH-002', '第二张监听卡'), 'utf8')
      const added = await waitForSnapshot(updates, (snapshot) => snapshot.stats.cardCount === 2)
      expect(added.cards.some((card) => card.id === 'EXP-WATCH-002')).toBe(true)
      expect(Date.now() - addedAt).toBeLessThan(2_000)

      updates.length = 0
      const deletedAt = Date.now()
      await rm(join(cardDirectory, 'B.md'))
      const deleted = await waitForSnapshot(updates, (snapshot) => snapshot.stats.cardCount === 1)
      expect(deleted.cards.some((card) => card.id === 'EXP-WATCH-002')).toBe(false)
      expect(Date.now() - deletedAt).toBeLessThan(2_000)
    } finally {
      await service.dispose()
    }
  })
})
