# 日程助手 AI CLI 集成指南

`scheduleassistant.exe` 同时提供桌面 GUI 和面向 AI 的 CLI 模式，是 Codex、Claude Code、Skill、插件和 MCP 服务共用的确定性入口。无参数启动时打开桌面界面，带 `schedule` 命令时不创建窗口并返回结构化结果。两种模式使用同一个 SQLite 数据库；桌面应用运行时会在下一轮提醒扫描中读取 CLI 新建的日程。

## 命令契约

### 创建日程

```powershell
scheduleassistant.exe schedule create `
  --title "设计评审" `
  --date 2026-08-30 `
  --start 09:00 `
  --end 10:00 `
  --location "在线会议" `
  --notes "检查最终交互稿" `
  --reminders 15,30 `
  --output json
```

参数约束：

- `title`、`date`、`start`、`end` 必填。
- `date` 必须为 `YYYY-MM-DD`，时间必须为 24 小时制 `HH:mm`。
- 日程不能跨天，必须位于本机时区的 `08:00–21:00`。
- `reminders` 是日程开始前的分钟数，使用逗号分隔；`none` 表示不提醒。
- `output` 支持 `json`（默认）和 `text`。
- `database` 可指定测试数据库；省略时使用桌面应用数据库。

成功响应：

```json
{
  "ok": true,
  "schedule": {
    "id": "...",
    "title": "设计评审",
    "startAt": "2026-08-30T09:00:00+08:00",
    "endAt": "2026-08-30T10:00:00+08:00",
    "reminderOffsets": [15, 30],
    "status": "pending"
  }
}
```

### 查询日程

```powershell
scheduleassistant.exe schedule list --date 2026-08-30 --status pending
```

`date` 可省略，`status` 支持 `all`、`pending`、`completed`、`cancelled`。成功响应包含 `ok`、`count` 和 `schedules`。

### 错误恢复

无效调用返回非零退出码，并向标准错误输出可恢复的 JSON：

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_DATETIME",
    "message": "日期 \"明天\" 格式无效",
    "resolution": "日期使用 YYYY-MM-DD，时间使用 24 小时制 HH:mm，例如 --date 2026-08-30 --start 09:00 --end 10:00",
    "retryable": true
  }
}
```

AI 应根据 `resolution` 修正参数后重试，不应直接修改 SQLite。

## Codex 或 Claude Code Skill

仓库内的 [`skills/schedule-assistant/SKILL.md`](../skills/schedule-assistant/SKILL.md) 是 Skill 的唯一规则来源，负责将自然语言转换为确定性 CLI 参数、处理 JSON 和在创建后核验结果。它不会直接操作 SQLite。

Codex 用户可运行 [`scripts/install-codex-skill.ps1`](../scripts/install-codex-skill.ps1) 安装到 `$CODEX_HOME/skills` 或默认的用户 Skill 目录。安装脚本只复制 Skill 文件，不下载第二个 EXE。其他支持 Markdown Skill 的 agent 可以复用同一目录，不需要复制业务规则或维护独立插件。

## MCP 或插件封装

需要图形化插件市场或远程 agent 接入时，可以在 CLI 外增加一个很薄的 MCP Server，仅暴露两个工具：

- `ScheduleAssistant:schedule_create`：映射到 `schedule create`。
- `ScheduleAssistant:schedule_list`：映射到 `schedule list`。

MCP 层只负责参数 schema、启动 CLI 和解析 JSON，不复制时间校验、数据库写入或提醒逻辑。这样桌面应用、CLI、Skill 和插件始终共享同一套领域规则。

## 安全边界

- CLI 只访问本机数据库，不上传日程内容。
- AI 必须在写入前明确得到用户的创建意图。
- CLI 不负责猜测含糊时间；“下午”“下周”等自然语言必须由 AI 转换或向用户澄清。
- 发布到其他电脑时，CLI 模式和桌面界面使用同一个 `scheduleassistant.exe`，无需额外下载文件。
