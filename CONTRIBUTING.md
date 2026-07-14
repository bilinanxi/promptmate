# 贡献指南

感谢你参与 PromptMate。

## 开始之前

1. 先查看开发方案和任务清单，确认改动属于当前里程碑。
2. 对较大功能先创建 Issue，说明用户价值、范围和验收方式。
3. 不要在 Issue、日志、测试夹具或提交中包含 API Key、个人图片和其他敏感信息。

## 本地开发

项目目前处于初始化阶段。正式工程骨架建立后，本节将补充完整的依赖安装、测试和构建命令。

现有 HTML 原型可以直接用浏览器打开：

```text
prompt-assistant-prototype.html
```

## 分支和提交

分支命名建议：

- `feat/<description>`：新功能
- `fix/<description>`：缺陷修复
- `docs/<description>`：文档
- `test/<description>`：测试
- `refactor/<description>`：重构
- `ci/<description>`：持续集成

提交使用 Conventional Commits：

```text
feat(editor): add bilingual prompt composition
fix(import): report invalid JSONL line number
```

每个提交只完成一个独立功能或修复，并包含相应测试。不要把无关格式化或重构混入功能提交。

## Pull Request 要求

PR 描述至少包含：

- 改动目的和范围；
- 用户可见行为；
- 测试方法与真实结果；
- 涉及数据格式或迁移时的兼容性说明；
- 涉及远程接口、图片上传、凭据或自动粘贴时的隐私与安全影响。

## 第三方提示词数据

数据贡献必须提供：

- 原始仓库或页面 URL；
- 固定 Commit 或不可变版本；
- 文件路径和原作者；
- 明确的许可证；
- 翻译、拆分、去重或改写记录。

没有明确许可证、来源混杂或无法确认再分发权利的内容不能进入内置词库。

## 许可证

提交贡献即表示你有权提交相关内容，并同意按照本仓库的 Apache License 2.0 对代码贡献进行授权。第三方数据仍须遵循其原始许可证。
