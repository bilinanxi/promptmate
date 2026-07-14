# PromptMate（灵感词）

一款面向 AI 图片与视频创作者的 **Windows 本地开源提示词助手**。

> [!IMPORTANT]
> 项目目前处于需求确认和交互原型阶段，尚未提供可安装的正式版本。仓库中的 HTML 文件仅用于验证界面和主要交互，不会调用真实 API，也不会执行跨应用自动粘贴。

## 产品目标

- 支持文生图、图生图、文生视频和图生视频提示词工作流；
- 支持中文、英文及中英混合输入，并生成语义一致的中英文结果；
- 提供本地词库搜索、分类、组合、模板、收藏和历史；
- 通过用户自备的 OpenAI-compatible API 或 Ollama 进行提示词优化；
- 支持图片分析、结构化拆解、语义匹配和候选词条生成；
- 提供 Windows 悬浮窗，并在系统安全边界内尝试向目标输入框粘贴；
- 默认本地运行，不要求账号、云同步或项目自建业务服务器。

## 当前内容

| 文件 | 说明 |
| --- | --- |
| [`2026-07-14_130423-prompt-assistant-development-plan.md`](./2026-07-14_130423-prompt-assistant-development-plan.md) | 完整开发方案、架构、数据设计与 M0–M10 里程碑 |
| [`2026-07-14_133048-prompt-assistant-handoff.md`](./2026-07-14_133048-prompt-assistant-handoff.md) | 原始任务清单、产品共识与交接记录 |
| [`prompt-assistant-prototype.html`](./prompt-assistant-prototype.html) | 可交互的单文件 HTML 验证原型 |

## 查看交互原型

直接下载并使用浏览器打开 `prompt-assistant-prototype.html`。原型中的优化、图片分析、接口状态和自动粘贴均为模拟效果。

## 计划技术栈

- Tauri 2
- React + TypeScript + Vite
- Rust
- SQLite、JSONL、YAML
- Vitest、Playwright、Cargo Test

## 开发原则

- 按里程碑逐项交付，每个独立功能使用一次 Conventional Commit；
- 核心模块采用测试驱动开发；
- API Key 使用 Windows Credential Manager，不写入配置、日志或导出文件；
- 第三方提示词数据必须核验许可证并保留来源链；
- 无明确许可证的数据不随软件分发；
- 自动粘贴失败时降级为复制，不绕过 Windows 权限边界。

## 参与贡献

请先阅读 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。提交数据贡献时，必须同时提供原始来源、固定版本和许可证信息。

## 许可证

项目代码采用 [Apache License 2.0](./LICENSE) 授权。第三方数据、素材和依赖仍遵循各自许可证；未来纳入的第三方数据将通过 NOTICE 和来源清单单独说明。
