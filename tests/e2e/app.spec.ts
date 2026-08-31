import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'

const projectRoot = resolve(__dirname, '../..')
const publicImageDirectory = join(projectRoot, 'docs', 'images')
const userRoots = ['01_原始经验卡片', '02_项目经历索引', '04_面试知识库', '05_阶段复盘', '06_待学习知识']
const shouldCapturePublicImages = process.env.UPDATE_SCREENSHOTS === '1'

interface DemoCard {
  id: string
  title: string
  project: string
  domain: string
  tags: string[]
  keyword: string
  problem: string
  rootCause: string
  solution: string
  verification: string
  question: string
  shortAnswer: string
}

const demoCards: DemoCard[] = [
  {
    id: 'DEMO-SEC-001',
    title: '多租户权限边界遗漏',
    project: 'Atlas 数据平台',
    domain: 'SECURITY',
    tags: ['权限', '多租户'],
    keyword: '权限',
    problem: '普通成员能够看到不属于当前租户的记录。',
    rootCause: '查询构造器没有把 tenant_id 作为强制过滤条件。',
    solution: '在服务端统一注入租户范围，并为越权读取增加负向测试。',
    verification: '跨租户读取返回 404，同租户回归用例全部通过。',
    question: '你如何设计并验证多租户权限隔离？',
    shortAnswer: '我把租户边界下沉到服务端查询层，并用跨租户负向用例验证任何入口都不能绕过。'
  },
  {
    id: 'DEMO-RAG-002',
    title: 'RAG 检索召回不稳定',
    project: 'Beacon 知识助手',
    domain: 'AI_RAG',
    tags: ['RAG', '检索'],
    keyword: 'RAG',
    problem: '相同问题在不同表述下返回的证据差异很大。',
    rootCause: '分块粒度过大，标题与正文没有使用不同检索权重。',
    solution: '缩小语义分块并提高标题、实体和精确短语的权重。',
    verification: '离线评测集的有效召回率从 71% 提升到 91%。',
    question: 'RAG 召回不稳定时，你会如何定位？',
    shortAnswer: '我先固定评测集，再分别检查切块、索引和排序，最终通过更细分块与字段加权稳定召回。'
  },
  {
    id: 'DEMO-DATA-003',
    title: 'TopN 排名出现并列漂移',
    project: 'Atlas 数据平台',
    domain: 'DATABASE',
    tags: ['TopN', 'SQL'],
    keyword: 'TopN',
    problem: '指标相同的门店在多次查询中顺序不一致。',
    rootCause: '窗口排序只有指标值，没有稳定的第二排序键。',
    solution: '追加业务主键作为确定性排序，并明确空值规则。',
    verification: '连续执行 100 次结果顺序一致，分页边界无重复。',
    question: '如何保证 TopN 查询结果稳定？',
    shortAnswer: '排名必须有完整且确定的排序键，我会加入业务主键并对分页边界做重复执行验证。'
  },
  {
    id: 'DEMO-FE-004',
    title: '长列表筛选引发界面卡顿',
    project: 'Cedar 运营工作台',
    domain: 'FRONTEND',
    tags: ['React', '性能'],
    keyword: 'React',
    problem: '输入筛选词时主线程出现明显停顿。',
    rootCause: '每次按键都会重复解析全文并渲染全部卡片。',
    solution: '预建轻量索引、缓存筛选结果，并只渲染可见卡片。',
    verification: '一千条演示数据下交互反馈稳定在 100ms 内。',
    question: '你如何定位 React 长列表的性能问题？',
    shortAnswer: '我用性能面板分离计算和渲染开销，再用索引缓存和可见区渲染降低主线程负担。'
  },
  {
    id: 'DEMO-API-005',
    title: '接口重试造成重复写入',
    project: 'Delta 任务系统',
    domain: 'BACKEND',
    tags: ['幂等', 'API'],
    keyword: '幂等',
    problem: '网络抖动后同一个任务偶尔会创建两次。',
    rootCause: '客户端自动重试，但服务端没有识别同一业务请求。',
    solution: '引入幂等键和唯一约束，并保存首次响应结果。',
    verification: '并发重放同一请求只产生一条记录。',
    question: '如何为写接口设计可靠的幂等机制？',
    shortAnswer: '我使用业务幂等键、数据库唯一约束和响应复用，覆盖并发与超时重试两类场景。'
  },
  {
    id: 'DEMO-DB-006',
    title: '慢查询缺少组合索引',
    project: 'Atlas 数据平台',
    domain: 'DATABASE',
    tags: ['索引', '性能'],
    keyword: '索引',
    problem: '高峰期报表查询从 300ms 上升到 8s。',
    rootCause: '过滤与排序字段分散在多个单列索引中。',
    solution: '依据实际谓词顺序建立覆盖型组合索引。',
    verification: '执行计划改为索引扫描，P95 降至 420ms。',
    question: '你如何判断应该建立组合索引？',
    shortAnswer: '我从执行计划和真实谓词出发设计索引，并用写入成本与 P95 改善共同验证。'
  },
  {
    id: 'DEMO-FE-007',
    title: '表单异步校验竞态',
    project: 'Cedar 运营工作台',
    domain: 'FRONTEND',
    tags: ['表单', '竞态'],
    keyword: '竞态',
    problem: '快速输入时旧请求会覆盖最新校验结果。',
    rootCause: '响应提交时没有确认它是否仍对应当前输入。',
    solution: '取消过期请求，并在提交结果前比对请求序号。',
    verification: '模拟高延迟与连续输入后不再出现错误提示回退。',
    question: '前端异步请求竞态应该怎样处理？',
    shortAnswer: '我同时使用取消信号和请求序号，确保只有当前输入对应的响应可以更新界面。'
  },
  {
    id: 'DEMO-SEC-008',
    title: '导出文件存在公式注入风险',
    project: 'Cedar 运营工作台',
    domain: 'SECURITY',
    tags: ['导出', '安全'],
    keyword: '公式注入',
    problem: '用户输入以等号开头时会被表格软件当作公式执行。',
    rootCause: '导出流程只做了 CSV 转义，没有做危险前缀处理。',
    solution: '在可信服务端统一净化公式前缀并保留原始审计值。',
    verification: '危险样例在常见表格软件中均按纯文本显示。',
    question: 'CSV 导出为什么也需要安全审查？',
    shortAnswer: '表格软件会解释公式前缀，我在服务端净化危险值，并用真实客户端验证不会执行。'
  },
  {
    id: 'DEMO-RAG-009',
    title: '知识更新后索引未及时刷新',
    project: 'Beacon 知识助手',
    domain: 'AI_RAG',
    tags: ['索引', '一致性'],
    keyword: '刷新',
    problem: '内容已更新，但检索仍返回旧摘要。',
    rootCause: '文件监听只处理新增事件，没有覆盖原子替换产生的重命名事件。',
    solution: '统一处理新增、更新、重命名和删除，并加入防抖重扫。',
    verification: '原子替换后两秒内能检索到最新内容。',
    question: '文件监听如何兼顾实时性与一致性？',
    shortAnswer: '我把不同文件事件收敛为防抖重扫，并用原子替换和删除场景验证最终一致。'
  },
  {
    id: 'DEMO-API-010',
    title: '后台任务缺少可观测状态',
    project: 'Delta 任务系统',
    domain: 'BACKEND',
    tags: ['任务', '可观测性'],
    keyword: '可观测性',
    problem: '用户只能看到任务处理中，无法判断卡在哪一步。',
    rootCause: '任务只记录最终状态，没有阶段、耗时和错误分类。',
    solution: '增加阶段状态机、结构化事件和面向用户的失败摘要。',
    verification: '故障演练中可在一分钟内定位失败阶段。',
    question: '怎样让异步任务更容易排查？',
    shortAnswer: '我把任务拆成可观察阶段，记录结构化事件，并让失败状态既可定位又能被用户理解。'
  },
  {
    id: 'DEMO-FE-011',
    title: '暗色主题对比度不足',
    project: 'Cedar 运营工作台',
    domain: 'FRONTEND',
    tags: ['可访问性', '主题'],
    keyword: '对比度',
    problem: '暗色模式下辅助文字和焦点边框难以辨认。',
    rootCause: '颜色令牌只按视觉接近转换，没有验证对比度。',
    solution: '重建语义颜色令牌，并为焦点状态设置独立高对比颜色。',
    verification: '关键文本与交互状态通过自动与人工可访问性检查。',
    question: '主题切换如何保证可访问性？',
    shortAnswer: '我用语义令牌管理颜色，并将对比度和键盘焦点纳入每个主题的验收。'
  },
  {
    id: 'DEMO-API-012',
    title: '批处理失败无法安全续跑',
    project: 'Delta 任务系统',
    domain: 'BACKEND',
    tags: ['批处理', '恢复'],
    keyword: '续跑',
    problem: '长批次在中途失败后只能从头重新执行。',
    rootCause: '缺少检查点，也没有区分可重试和永久失败。',
    solution: '按批次保存检查点，对失败类型分类并保证步骤幂等。',
    verification: '在任意检查点注入故障后都能从下一安全位置恢复。',
    question: '批处理怎样设计可恢复执行？',
    shortAnswer: '我通过检查点、错误分类和幂等步骤组合，让任务在故障后从已确认位置继续。'
  }
]

let app: ElectronApplication
let page: Page
let suiteRoot = ''
let stateRoot = ''
let browserDataRoot = ''
let codexHome = ''
let knowledgeRoot = ''
let initialKnowledgeHash = ''
let selectedCardId = ''
const noteText = '演示笔记：先说明根因，再给出验证证据。'

function cardMarkdown(card: DemoCard, index: number): string {
  const date = `2026-08-${String(10 + index).padStart(2, '0')}T09:00:00+08:00`
  return `---
id: ${card.id}
title: ${JSON.stringify(card.title)}
created_at: ${JSON.stringify(date)}
updated_at: ${JSON.stringify(date)}
project: ${JSON.stringify(card.project)}
domain: ${card.domain}
type: debug
status: solved
verification: verified
impact: 3
diagnosis_depth: 4
technical_depth: 4
experience_score: ${14 + (index % 5)}
difficulty: ${3 + (index % 3)}
learning_value: ${4 + (index % 2)}
interview_value: ${4 + (index % 2)}
reusability: 5
tags: [${card.tags.map((tag) => JSON.stringify(tag)).join(', ')}]
related: []
---

# ${card.id}：${card.title}

## 1. 背景与目标

这是完全虚构的公开演示案例，用于验证学习中心的阅读、检索与面试训练体验。

## 2. 问题表现

${card.problem}

## 3. 排查过程

先建立最小复现，再通过日志、指标和对照实验逐步缩小范围。关键词：${card.keyword}。

## 4. 根因

${card.rootCause}

## 5. 最终解决方案

${card.solution}

## 6. 验证

${card.verification}

## 7. 我真正学到了什么

修复本身只是起点；可重复的定位方法、自动化验证和清晰边界才是可迁移经验。

## 8. 下次再遇到，最快怎么定位

先确认影响边界，再构造稳定复现，最后用一项可观测证据验证每个假设。

## 12. 面试提炼

围绕背景、根因、行动、验证和复盘组织回答，所有内容均来自本演示卡片。

## 13. 面试问题

${card.question}

## 14. 30 秒回答

${card.shortAnswer}

## 15. 2 分钟结构

- 背景：先交代用户影响和约束。
- 任务：说明需要恢复的正确边界。
- 行动：描述如何复现、定位并选择方案。
- 结果：用可验证指标说明改进。
- 复盘：补充预防复发的自动化门禁。

## 16. 追问

- 为什么没有选择只在界面层规避？
- 如何证明修复覆盖了所有入口？
- 如果数据规模扩大十倍，方案还成立吗？
`
}

async function createDemoKnowledgeBase(root: string): Promise<void> {
  for (const directory of userRoots) await mkdir(join(root, directory), { recursive: true })
  for (const [index, card] of demoCards.entries()) {
    await writeFile(join(root, '01_原始经验卡片', `${card.id}.md`), cardMarkdown(card, index), 'utf8')
  }

  const documents: Array<[string, string, string]> = [
    ['02_项目经历索引', '演示项目索引.md', '# 演示项目索引\n\n四个虚构项目用于展示按项目复习的完整流程。'],
    ['04_面试知识库', '演示面试清单.md', '# 演示面试清单\n\n按问题、行动、结果和复盘准备每一个案例。'],
    ['05_阶段复盘', '演示阶段复盘.md', '# 演示阶段复盘\n\n本周重点是权限边界、检索质量和稳定性表达。'],
    ['06_待学习知识', '演示待学习.md', '# 演示待学习知识\n\n继续巩固可观测性与性能测试方法。']
  ]
  for (const [directory, name, content] of documents) {
    await writeFile(join(root, directory, name), content, 'utf8')
  }
}

async function listFiles(directory: string): Promise<string[]> {
  const output: string[] = []
  const entries = await readdir(directory, { withFileTypes: true, encoding: 'utf8' }).catch(() => [])
  for (const entry of entries) {
    const absolute = join(directory, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) output.push(...(await listFiles(absolute)))
    else if (entry.isFile()) output.push(absolute)
  }
  return output
}

async function knowledgeHash(root: string): Promise<string> {
  const files = (await Promise.all(userRoots.map((entry) => listFiles(join(root, entry))))).flat().sort()
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(relative(root, file).replace(/\\/g, '/'))
    hash.update(await readFile(file))
  }
  return hash.digest('hex')
}

async function launch(scale: 1.25 | 1.5): Promise<void> {
  app = await electron.launch({
    args: [`--user-data-dir=${browserDataRoot}`, `--force-device-scale-factor=${scale}`, projectRoot],
    cwd: projectRoot,
    env: {
      ...process.env,
      APPDATA: stateRoot,
      CODEX_HOME: codexHome,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
    },
    timeout: 30_000
  })
  page = await app.firstWindow({ timeout: 30_000 })
  await page.waitForLoadState('domcontentloaded')
}

async function setWindowSize(width: number, height: number): Promise<void> {
  await app.evaluate(({ BrowserWindow }, bounds) => {
    const window = BrowserWindow.getAllWindows()[0]
    window.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height })
  }, { width, height })
}

async function captureWindow(name: string): Promise<void> {
  if (!shouldCapturePublicImages) return
  await mkdir(publicImageDirectory, { recursive: true })
  await page.locator('#main-content').evaluate((element) => element.scrollTo({ top: 0, left: 0, behavior: 'instant' }))
  const base64 = await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    return (await window.capturePage()).toPNG().toString('base64')
  })
  await writeFile(join(publicImageDirectory, name), Buffer.from(base64, 'base64'))
}

async function expectPositiveResultCount(): Promise<void> {
  await expect.poll(async () => Number((await page.locator('.results-heading strong').textContent()) ?? 0)).toBeGreaterThan(0)
}

test.describe.serial('工程经验求职学习中心（合成演示知识库）', () => {
  test.beforeAll(async () => {
    suiteRoot = await mkdtemp(join(tmpdir(), 'experience-study-e2e-'))
    stateRoot = join(suiteRoot, 'appdata')
    browserDataRoot = join(suiteRoot, 'browser')
    codexHome = join(suiteRoot, 'codex-home')
    knowledgeRoot = join(suiteRoot, 'demo-knowledge')
    await Promise.all([
      mkdir(stateRoot, { recursive: true }),
      mkdir(browserDataRoot, { recursive: true }),
      mkdir(codexHome, { recursive: true }),
      createDemoKnowledgeBase(knowledgeRoot)
    ])
    await writeFile(join(codexHome, 'experience-recorder.json'), JSON.stringify({ knowledge_root: knowledgeRoot }, null, 2), 'utf8')
    initialKnowledgeHash = await knowledgeHash(knowledgeRoot)
    await launch(1.25)
  })

  test.afterAll(async () => {
    if (app) await app.close().catch(() => undefined)
    if (suiteRoot.startsWith(resolve(tmpdir()))) await rm(suiteRoot, { recursive: true, force: true })
  })

  test('首次启动从临时配置发现演示知识库并完成引导', async () => {
    await expect(page.getByRole('heading', { name: '连接你的工程经验库' })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.onboarding-kb-stats')).toContainText('12张经验卡')
    await expect(page.locator('.onboarding-kb-stats')).toContainText('4个项目')
    await expect(page.locator('.onboarding-kb-stats')).toContainText('5个领域')
    await page.getByRole('button', { name: /下一步/ }).click()
    await expect(page.getByRole('heading', { name: '选择求职重点' })).toBeVisible()
    await page.getByRole('button', { name: /下一步/ }).click()
    await expect(page.getByRole('heading', { name: '设定学习节奏' })).toBeVisible()
    await setWindowSize(1440, 900)
    await captureWindow('onboarding-setup.png')
    await page.getByRole('button', { name: /进入学习中心/ }).click()
    await expect(page.getByRole('heading', { name: '设定学习节奏' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '经验库', exact: true })).toBeVisible()
    await expect(page.locator('.topbar-context')).toContainText('12 张经验卡')
  })

  test('中文与混合关键词检索、卡片阅读和学习状态写入', async () => {
    await page.getByRole('button', { name: '经验库', exact: true }).click()
    const search = page.locator('[data-global-search]')
    for (const query of ['TopN', '权限', 'RAG']) {
      await search.fill(query)
      await expectPositiveResultCount()
    }
    await search.fill('权限')
    await expectPositiveResultCount()
    await expect(page.locator('mark').filter({ hasText: '权限' }).first()).toBeVisible()
    await captureWindow('knowledge-library-search.png')
    await search.fill('')
    const tile = page.locator('.knowledge-tile').first()
    selectedCardId = (await tile.locator('.tile-id').textContent())?.trim() ?? ''
    expect(selectedCardId).not.toBe('')
    await tile.click()
    await expect(page.locator('.card-reader')).toBeVisible()
    await page.getByTitle('收藏').click()
    await page.getByLabel('个人学习笔记').fill(noteText)
    await page.getByRole('button', { name: /保存笔记/ }).click()
    await page.locator('.learning-control select').selectOption({ label: '学习中' })
    await expect(page.getByTitle('取消收藏')).toBeVisible()
    await page.getByTitle('关闭（Esc）').click()
  })

  test('面试训练使用演示卡已有材料并支持计时与逐步揭示', async () => {
    await page.getByRole('button', { name: '面试训练', exact: true }).click()
    await expect(page.getByText('INTERVIEW QUESTION')).toBeVisible()
    await page.getByRole('button', { name: /开始计时/ }).click()
    await expect(page.getByRole('button', { name: /暂停/ })).toBeVisible()
    await page.waitForTimeout(1_100)
    await expect(page.locator('.timer-display')).not.toContainText('00:30')
    await page.getByRole('button', { name: /暂停/ }).click()
    await page.getByRole('button', { name: /揭示 30 秒回答/ }).click()
    await expect(page.getByRole('heading', { name: '30 秒回答' })).toBeVisible()
    await page.getByRole('button', { name: /继续揭示完整结构/ }).click()
    await expect(page.getByRole('heading', { name: '2 分钟展开' })).toBeVisible()
    await captureWindow('interview-training.png')
  })

  test('亮暗主题与 125% 下的 1280×720 布局', async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.locator('.theme-options button').filter({ hasText: '亮色' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await setWindowSize(1280, 720)
    await expect(page.locator('.settings-page')).toBeVisible()
    await page.locator('.theme-options button').filter({ hasText: '暗色' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('button', { name: '学习进度', exact: true }).click()
    await captureWindow('learning-progress-dark.png')
  })

  test('150% 重启后恢复收藏、笔记、学习状态并保持知识库零写入', async () => {
    await app.close()
    await launch(1.5)
    await expect(page.locator('.app-shell')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('heading', { name: '连接你的工程经验库' })).toHaveCount(0)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('button', { name: '经验库', exact: true }).click()
    const search = page.locator('[data-global-search]')
    await search.fill(selectedCardId)
    await expectPositiveResultCount()
    await page.locator('.knowledge-tile').first().click()
    await expect(page.getByTitle('取消收藏')).toBeVisible()
    await expect(page.getByLabel('个人学习笔记')).toHaveValue(noteText)
    await expect(page.locator('.learning-control select')).toHaveValue('learning')
    await page.getByTitle('关闭（Esc）').click()

    await setWindowSize(1920, 1080)
    const persisted = JSON.parse(await readFile(join(stateRoot, 'EngineeringExperienceStudyCenter', 'learning-state.v1.json'), 'utf8')) as {
      cards: Record<string, { favorite: boolean; note: string; status: string }>
    }
    expect(persisted.cards[selectedCardId]).toMatchObject({ favorite: true, note: noteText, status: 'learning' })
    expect(await knowledgeHash(knowledgeRoot)).toBe(initialKnowledgeHash)
  })
})
