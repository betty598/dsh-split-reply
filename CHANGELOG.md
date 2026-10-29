# Changelog

## 0.1.0 — 2026-10-29

第一个能用的版本。

- 在 `QQBot.prototype.sendMarkdown` 外包一层，把回复按 `。！？!?…~` 和换行拆成 2–4 条，隔 0.7–1.6 秒逐条发送
- 带键盘的按钮消息、代码块、表格、Markdown 标题整段放行，不拆
- 碎片自动并回邻居，段数超上限自动合并
- 拆到一半被限流时不抛错，只记日志、停止继续发
- 提供 `/dsh-split-reply/status` 查状态（webServer 可选注入）
- 诊断日志落在 `~/.dsh/split-reply/diag.log`
