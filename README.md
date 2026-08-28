# 日程助手

日程助手是一款本地优先的桌面日程待办提醒软件。项目使用 Wails 3 组合 Go 后端与 React 前端，日程数据保存在本机 SQLite 数据库中，并通过系统通知发送提醒。

## 已实现功能

- 日视图与周视图，以及迷你月历导航
- 新建、编辑、删除日程和完成状态切换
- 日期时间选择、地点、备注、颜色和多提醒配置
- SQLite 本地持久化与重复提醒去重
- 系统通知、通知点击回到日程、系统唤醒后补充扫描
- 单实例、关闭到系统托盘、托盘快捷新建
- 可选开机后台启动
- 浏览器开发预览使用 `localStorage` 降级，无需启动桌面壳即可调试页面

## 技术架构

| 层级 | 技术 | 职责 |
| --- | --- | --- |
| 桌面容器 | Wails 3 Beta | 窗口、托盘、通知、开机启动、打包 |
| 后端 | Go 1.25 | 业务校验、提醒调度、前端绑定服务 |
| 数据 | SQLite（modernc 纯 Go 驱动） | 日程与提醒发送记录持久化 |
| 前端 | React 18、TypeScript、Vite | 日历、日程表单和设置界面 |
| 测试 | Go test、Vitest | 领域、仓储和日期布局逻辑 |

## 本地开发

环境要求：Go 1.25、Node.js 22、Wails 3 Beta.15。Windows 还需要 WebView2 Runtime。

```powershell
cd frontend
npm install
npm run dev
```

浏览器预览地址为 `http://127.0.0.1:9245/`。运行完整桌面开发环境：

```powershell
wails3 dev
```

## 测试与构建

```powershell
go test ./...
cd frontend
npm test
npm run build
cd ..
wails3 build
```

Windows 生产可执行文件生成在 `bin/scheduleassistant.exe`。安装包需要安装 NSIS 后执行：

```powershell
wails3 package
```

## 数据位置

桌面版数据库位于当前用户配置目录的 `ScheduleAssistant/schedule-assistant.db`。数据库启用 WAL、外键约束和忙等待，提醒发送记录用于避免同一提醒重复通知。

项目范围与后续迭代计划见 [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)。
