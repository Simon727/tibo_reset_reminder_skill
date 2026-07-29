# 排障指南

## Hermes 为什么要求授权？

Skill 文件本身不能创建或维持 cronjob。“一句话安装”要求每 5 分钟检查一次，因此 Hermes 会代表用户调用 `cronjob:create`，也可能调用 `cronjob:run` 完成首次测试。

这些操作会持续改变宿主状态，所以出现授权提示是正常的。永久授权不是必须条件；建议先选择单次授权，检查执行频率、任务内容和通知对象。

## Agent 安装时为什么像是卡住了？

先检查当前停在哪一步：

1. **等待权限**：宿主可能正在等用户批准网络访问或创建定时任务。
2. **等待 X 抓取**：旧版 Skill 或自行改写的提示词可能让 Agent 直接访问 X、Google Cache 或搜索引擎。
3. **等待后台任务**：Skill 每次只执行一次检查，创建调度后不应该一直占用当前会话等待下一轮。

当前版本默认读取公共 Feed。安装时不应使用 Google Cache，也不应要求最终用户提供 X API Token。

## 一直没有提醒，是不是坏了？

没有新的明确重置时间时保持静默是预期行为。检查以下项目：

- 打开 [`/api/health`](https://tibo-reset-reminder-skill.vercel.app/api/health)，确认 `ok: true` 和 `stale: false`。
- 检查宿主的定时任务是否仍然启用，频率是否为每 5 分钟。
- 确认宿主抑制了精确输出 `NO_REPLY`，而不是把它当作普通通知发给用户。
- 检查 `TIBO_RESET_REMINDER_STATE` 指向的状态文件是否可写并能跨轮次保留。

## Feed 返回 `stale: true`

这表示缓存超过了新鲜度阈值，通常是上游 X 页面暂时不可用。Skill 应把本轮当作抓取失败并保持静默，不能用旧数据得出“没有新推文”的结论。

维护者应检查 QStash 最近投递、Vercel Function 日志、Redis 连接和 `/api/refresh` 的最近错误。不要自动切换到 Google Cache、搜索片段、公共 Nitter 或未知代理。

## 首次总结为什么写“至少 N 次”？

服务尚未连续积累满 7 天时，Feed 不能证明更早的日期没有发生重置。为了避免伪造精确统计，Skill 会说明当前可核验的最早时间，并使用“当前范围内至少 N 次”。

当 `seven_day_history_complete` 变为 `true` 后，才会给出完整七天统计。

## 为什么收到重复提醒？

检查不同定时任务是否共用了错误的状态路径，或者同一任务是否发生并发执行。每个轮询任务应拥有稳定、可写且持久化的 `TIBO_RESET_REMINDER_STATE`，并禁止重叠运行。

Skill 会使用帖子 ID 和文本哈希去重。帖子内容被编辑后重新判断属于预期行为。

## 能否直接使用 X API？

普通用户不需要。项目维护者可以预先配置 `X_BEARER_TOKEN` 作为可选故障恢复，但不得向最终安装用户索要 Token，也不得把 Token 写入提示词、仓库或日志。

## Skill 能否自己每 5 分钟运行？

不能。Skill 定义的是一次检查如何执行；Automation、Scheduled Task 或 Cronjob 由 Codex、Hermes 等宿主或操作系统负责创建和唤醒。

调度参数见 [`../references/scheduling.md`](../references/scheduling.md)，服务内部行为见 [`architecture.md`](architecture.md)。
