---
name: schedule-assistant
description: 使用本机日程助手 CLI 创建或查询不跨天的日程和提醒。当用户要求添加、安排或查看本机日程、待办提醒时使用；不用于远程日历服务或仅咨询时间管理方法的请求。
---

# 日程助手

通过 `scheduleassistant.exe` 的 CLI 模式操作日程。始终调用 CLI，不直接读写 SQLite。

## 定位程序

按以下顺序寻找可执行文件：

1. 环境变量 `SCHEDULE_ASSISTANT_EXE` 指定的完整路径。
2. `PATH` 中的 `scheduleassistant.exe`。
3. Windows 默认用户级安装路径 `%LOCALAPPDATA%\Programs\日程助手\scheduleassistant.exe`。
4. 当前项目的 `bin/scheduleassistant.exe`。

找不到时说明依赖缺失，并请用户提供安装位置。不要自行下载或替换桌面程序。

## 创建日程

- 只有用户明确要求创建或安排日程时才执行写入；仅讨论方案时不要创建。
- 将日期解析为本机时区的 `YYYY-MM-DD`，时间解析为 24 小时制 `HH:mm`。日期或时间存在实质歧义时先询问。
- 日程必须同日、开始早于结束，并位于 `08:00` 至 `21:00`。
- 将提醒转换为开始前分钟数，例如“提前半小时和 5 分钟”对应 `30,5`；不提醒使用 `none`。
- 执行 `scheduleassistant.exe schedule create ... --output json`，并解析退出码与 JSON。
- 成功后执行 `schedule list --date <日期> --output json` 核验标题、时间和提醒，再向用户报告结果。
- 如果创建结果不确定，先查询同日同标题和时间是否已存在，再决定是否重试，避免重复日程。

示例：

```powershell
& $exe schedule create `
  --title '设计评审' `
  --date 2026-08-30 `
  --start 09:00 `
  --end 10:00 `
  --reminders 5,30 `
  --output json
```

## 查询日程

使用 `scheduleassistant.exe schedule list`。可传 `--date YYYY-MM-DD`，状态可选 `all`、`pending`、`completed` 或 `cancelled`。默认读取 JSON，不要根据终端展示文本猜测结果。

## 错误处理

当响应中 `ok=false` 时，向用户说明 `error.message`，并按 `error.resolution` 修正确定性参数错误。不要绕过 CLI 校验，也不要在权限、存储或未知错误后反复写入。
