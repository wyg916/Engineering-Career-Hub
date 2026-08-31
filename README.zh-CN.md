# 工程经验求职学习中心

[English](README.md)

把自己沉淀的工程经验卡，变成可检索、可复习、可训练表达的 Windows
离线桌面学习中心。

![首次引导与学习计划设置](docs/images/onboarding-setup.png)

它适合已经有项目复盘和经验卡，但平时很少主动翻阅的开发者。应用只在本机读取
知识库，不修改源经验卡；收藏、笔记、掌握度和复习计划独立保存在应用数据中。

## 核心能力

- **用真实经历准备面试**：直接练习卡片已有的面试问题、30 秒回答、2 分钟结构
  和追问，不生成虚构答案。
- **中文与中英混合检索**：检索标题、正文、项目、领域和标签，并按价值、验证
  状态、掌握状态和日期筛选。
- **透明的间隔复习**：六级 Leitner 规则采用当天、1、3、7、14、30 天间隔。
- **适合长文阅读**：结构化章节、目录导航、证据折叠、字号调节、宽屏模式和
  亮暗主题。
- **学习状态只留本机**：收藏、笔记、信心、历史和设置与知识库分离，并可导入
  导出 JSON。
- **Windows 原生交付**：当前用户 NSIS 安装、桌面与开始菜单快捷方式，以及
  125%/150% 缩放适配。

## 界面预览

### 检索和筛选经验库

![使用虚构权限案例进行检索](docs/images/knowledge-library-search.png)

### 计时练习并逐步揭示答案

![使用虚构经验卡进行面试训练](docs/images/interview-training.png)

### 在亮色或暗色主题查看进度

![暗色学习进度界面](docs/images/learning-progress-dark.png)

所有公开截图都由真实应用连接合成 E2E 知识库后生成，不含个人项目、真实经验卡、
笔记、本机用户路径或凭据。

## 隐私与数据边界

| 范围 | 行为 |
| --- | --- |
| 知识库 | 只读访问所选目录 |
| 学习数据 | 保存到 %APPDATA%\EngineeringExperienceStudyCenter |
| 网络 | 不请求 API、遥测、大模型或自动更新服务 |
| 渲染进程 | 沙箱运行，不能直接访问 Node.js 或文件系统 |
| Markdown | 经过严格 HTML 白名单清洗 |
| 外部链接 | 仅允许把 HTTP/HTTPS 链接交给默认浏览器 |

应用只扫描以下目录：

- 01_原始经验卡片
- 02_项目经历索引
- 04_面试知识库
- 05_阶段复盘
- 06_待学习知识

模板、系统日志、receipt 和 handoff 会被排除。任何浏览和学习操作都不会修改
知识库。

## Windows 安装

1. 打开 [最新 Release](https://github.com/wyg916/Engineering-Career-Hub/releases/latest)。
2. 下载 x64 安装程序。
3. 对照 Release 说明核验 SHA256。
4. 运行安装程序；默认安装到当前用户目录，不需要管理员权限。

PowerShell 校验示例：

~~~powershell
Get-FileHash .\Engineering-Experience-Study-Center-1.0.0-Setup.exe -Algorithm SHA256
~~~

当前安装包没有商业代码签名证书，Windows 可能显示“未知发布者”或信誉提示。
请先核对哈希再运行。

## 连接知识库

自动发现顺序：

1. 应用上次选择的目录。
2. CODEX_HOME 下的 experience-recorder.json。
3. %USERPROFILE%\.codex 下的 experience-recorder.json。
4. 手动选择目录。

所选根目录必须包含 01_原始经验卡片。完整操作流程见
[使用说明](docs/使用说明.md)。

## 本地开发与测试

需要 Windows 10/11、Node.js 24 或更高版本、Corepack 和 pnpm 11.19.0。

~~~powershell
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:e2e
~~~

构建 Windows x64 当前用户安装包：

~~~powershell
corepack pnpm package:win
~~~

Electron E2E 会创建临时虚构知识库，不读取开发者电脑上的 CODEX_HOME。只有明确
设置 UPDATE_SCREENSHOTS=1 时才会更新公开截图。

## 技术结构

- src/core：Markdown/YAML 解析、加权 n-gram 搜索和复习调度
- src/main：Electron 生命周期、知识库发现与监听、IPC 校验和原子状态存储
- src/preload：渲染进程窄接口
- src/renderer：React 用户界面
- tests：单元、负向、安全边界和 Electron E2E 测试

涉及安全或数据边界的修改，请先阅读 [贡献指南](CONTRIBUTING.md)、
[安全策略](SECURITY.md) 和 [公开验收报告](docs/验收报告.md)。

## 当前限制

- V1 仅支持 Windows x64。
- 安装包尚未签名。
- 不启用自动更新和开机启动。
- 不创建、改写或同步经验卡。
- 不内置大模型，也不生成面试答案。

## 许可证

项目使用 [MIT License](LICENSE)。公开视觉资产说明见
[资产来源](docs/asset-provenance.md)，运行依赖许可证见
[第三方软件说明](THIRD_PARTY_NOTICES.md)。

工程经验求职学习中心是独立开源项目，与 OpenAI 不存在隶属、赞助或官方背书关系。
Codex 及其他产品名称归其各自权利人所有。
