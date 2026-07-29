# tibo_reset_reminder_skill

> 中文为主版本。 [English version](#english-version)

一个安静工作的 Agent Skill：定期查看 Tibo（[@thsottiaux](https://x.com/thsottiaux)）的最新 X 动态，只有当他明确提到 **Codex 额度什么时候重置** 时才提醒你。

## 一句话让 Agent 安装

把下面这句话直接发给支持安装 Skills 和定时任务的 Agent：

```text
请从 https://github.com/orange90/tibo_reset_reminder_skill 安装 tibo_reset_reminder_skill；使用项目提供的免 Token 公共 Feed，不要使用 Google Cache，也不要向我索要 X API Token；安装后先运行一次，读取 Tibo（@thsottiaux）最近 7 天的动态并总结 Codex 额度实际重置了几次，然后配置为每 5 分钟检查一次；以后只有发现新的明确重置时间时才提醒我，附上内容摘要和原帖链接，否则保持静默。
```

仓库使用你容易识别的名称 `tibo_reset_reminder_skill`；安装时，Agent 会按照 Agent Skills 规范将技能注册为 `tibo-reset-reminder-skill`。

## 它会做什么

- 检查 Tibo 的原创帖、回复和引用帖，忽略普通转推。
- 默认读取项目维护的[公共 Feed](https://tibo-reset-reminder-skill.vercel.app/api/feed)，安装用户无需登录 X、无需申请 API，也无需设置 Token。
- 第一次运行时回看最近 7 天，将同一次重置的多条更新合并，告诉你实际发生了几次重置。
- 同时满足两个条件才提醒：内容确实与 Codex 额度有关，并且给出了明确或可执行的重置时间。
- “明天”“两小时后”“每周一重置”可以触发；单独说“很快”“我们会处理”不会触发。
- 使用帖子 ID 和文本哈希去重，不会重复提醒同一条内容；编辑后的帖子可以重新判断。
- 没有命中时返回 `NO_REPLY`，定时任务应抑制这个结果，不给用户发消息。

## 提醒语言

Skill 的说明和代码使用英文，但提醒会按照以下顺序选择语言：

1. 用户明确指定的语言；
2. 操作系统或宿主 Agent 的语言设置；
3. 当前对话使用的语言；
4. 都无法判断时使用英文。

中文提醒示例：

```text
Tibo 发了推特：Codex 额度马上要重置了。
他说：Codex 的每周额度将在两小时后恢复。
预计重置时间：两小时后（北京时间 18:00）
来源：https://x.com/thsottiaux/status/...
```

如果重置并不临近，Agent 会使用“将在周一重置”等准确表述，不会机械地说“马上”。

## 第一次运行：最近一周总结

Skill 安装后第一次运行，会发送一条一次性历史摘要：

```text
首次扫描完成：过去 7 天，Tibo 明确提到 Codex 额度重置共 2 次。
7 月 25 日 — 每周额度完成重置 — 原帖链接
7 月 28 日 — 滚动额度完成重置 — 原帖链接
接下来我会每 5 分钟检查一次；没有新的重置信息时不会打扰你。
```

计数以“实际重置事件”为单位，而不是以推文数量为单位。同一次重置的预告、补充和确认不会被算成三次；证据不明确的内容也不会被强行计入。

公共 Feed 刚上线、尚未连续积累满 7 天时，首次总结会明确写出当前可核验的最早时间，并使用“当前范围内至少 N 次”的措辞；积累满 7 天后才会给出完整七天统计。

已经安装过旧版本，想立刻体验这个功能，可以直接对 Agent 说：

```text
请用 $tibo-reset-reminder-skill 总结 Tibo 最近 7 天提到的 Codex 额度重置，按实际重置事件去重计数，并附上摘要和原帖链接；不要修改现有定时任务。
```

## 安装与配置

### 让 Agent 自动安装

推荐直接使用上面的“一句话安装”。Agent 应完成以下操作：

1. 将本仓库克隆或复制到宿主支持的 Skills 目录，并将技能目录注册为 `tibo-reset-reminder-skill`。
2. 立即运行一次首次扫描，发送最近 7 天的重置次数摘要并完成初始化。
3. 创建每 5 分钟运行一次的 automation、scheduled task 或 cron job。
4. 为不同轮询任务提供持久化状态文件，例如通过 `TIBO_RESET_REMINDER_STATE` 指定路径。
5. 配置通知渠道，并抑制精确输出 `NO_REPLY`。

### 手动安装

把仓库克隆到你的 Agent 所使用的 Skills 目录。以下命令中的目标目录应替换为宿主实际路径：

```bash
git clone https://github.com/orange90/tibo_reset_reminder_skill.git tibo-reset-reminder-skill
```

然后让宿主 Agent 读取 `SKILL.md`，先执行一次首次扫描，再参考 [`references/scheduling.md`](references/scheduling.md) 创建定时任务。

> Skill 每次只执行一次检查，它本身不是常驻进程。5 分钟轮询必须由宿主的定时任务能力负责。

## 为什么 Hermes 会请求 cronjob 权限

Skill 本身不能创建 cronjob。上面的“一句话安装”同时要求了定时检查，所以 Hermes 会代表用户调用宿主的 `cronjob:create`，并可能调用 `cronjob:run` 做首次测试。这类操作会长期改变宿主状态，因此 Hermes 请求授权是正常的。

永久授权不是 Skill 的必要条件。你可以先单次批准，检查任务内容、执行频率和通知对象，确认无误后再决定是否永久授权。

## 获取 X 动态

默认使用项目维护的公共 Feed：

- Feed 地址：`https://tibo-reset-reminder-skill.vercel.app/api/feed`
- Feed 服务集中读取 X 的公开网页语义数据，并用公开 Embed 补充可用内容；随后核验账号并缓存标准化结果。
- 每个 Skill 用户只读取 Feed，不再分别抓取 X，所以更稳定，也不会触发 Google Cache 的异常权限请求。
- Feed 返回 `stale: true` 时，Skill 会把本轮视为抓取失败并保持静默，不会把旧数据误判成“没有新推文”。

项目维护者可以自行设置 `X_BEARER_TOKEN` 作为官方 API 的可选故障恢复通道，但它不是安装要求。普通用户不应被要求提供 Token。禁止改用 Google Cache、搜索结果片段、公共 Nitter 或任意抓取代理。

## 公共 Feed 如何工作

```text
Upstash QStash（每 5 分钟）
        ↓ POST /api/refresh
Vercel Function → X 公开网页（Embed 作为补充）
        ↓
Upstash Redis（保存 30 天）
        ↓ GET /api/feed
所有已安装 Skill 的 Agent
```

- `/api/refresh` 只允许携带 `REFRESH_SECRET` 的请求，负责抓取、校验、合并和去重。
- `/api/feed` 是只读公共 JSON，允许跨域访问，不包含任何密钥。
- `/api/health` 返回最近成功时间、缓存是否过期和帖子数量。
- 抓取失败时保留最后一次成功缓存，并标记 `stale`；后续计划任务会继续重试。
- Feed 会持续累积历史。首次上线未满 7 天时，`seven_day_history_complete` 为 `false`，Agent 必须把首次总结写成“当前可核验范围内至少 N 次”，不能冒充完整七天统计。

这不是“X 主动 webhook”。X 对公开推文提供的真正 Webhook 需要官方开发者 API；本项目是在一个中心节点做低频轮询，再把结果免费共享给所有 Skill 用户。

## 项目维护者：免费部署到 Vercel

最终用户不需要完成本节。只有维护公共 Feed 的项目方需要配置一次。

1. 把仓库部署到 Vercel Hobby。
2. 在 Vercel Marketplace 添加 [Upstash for Redis](https://vercel.com/marketplace/upstash) 的免费实例，并连接到该项目。代码兼容 `UPSTASH_REDIS_REST_URL/TOKEN` 和 `KV_REST_API_URL/TOKEN` 两组变量名。
3. 生成一个至少 32 字节的随机值，在 Vercel 的 Production、Preview 和 Development 环境中保存为 `REFRESH_SECRET`。
4. 重新部署后，向 `POST https://你的域名/api/refresh` 发送 `Authorization: Bearer <REFRESH_SECRET>`，完成第一次缓存初始化。
5. 添加 [Upstash QStash](https://vercel.com/marketplace/upstash) 免费资源，创建计划：
   - Cron：`*/5 * * * *`
   - Method：`POST`
   - Destination：`https://你的域名/api/refresh`
   - Forwarded header：`Authorization: Bearer <REFRESH_SECRET>`
6. 打开 `/api/health`，确认 `ok: true`；再打开 `/api/feed` 检查标准化数据。

Vercel Hobby 自带 Cron 目前只能每天运行一次，因此 5 分钟刷新由 QStash 负责。每 5 分钟一次是每天 288 条消息；本项目只重试 1 次，即使全天每次都失败并重试也只有 576 条，低于 QStash 免费版每天 1,000 条的额度。Feed 只保存一个最多 200 条帖子的 JSON，远低于 Upstash Redis 免费额度。最新限制请以 [Vercel Cron 文档](https://vercel.com/docs/cron-jobs/usage-and-pricing)、[QStash 价格页](https://upstash.com/pricing/qstash)和 [Redis 价格页](https://upstash.com/pricing/redis)为准。

## 目录结构

```text
.
├── api/
│   ├── feed.js
│   ├── health.js
│   └── refresh.js
├── lib/
│   ├── config.js
│   ├── feed.js
│   ├── redis.js
│   └── syndication.js
├── SKILL.md
├── README.md
├── agents/openai.yaml
├── package.json
├── references/scheduling.md
├── scripts/
│   ├── fetch_x_posts.py
│   └── state_store.py
├── test/feed.test.js
└── vercel.json
```

---

## English version

An intentionally quiet Agent Skill that checks Tibo's ([@thsottiaux](https://x.com/thsottiaux)) latest X activity and notifies you only when he clearly states **when the Codex quota will reset**.

### Install with one sentence

Send this sentence to an Agent that supports Skills and scheduled tasks:

```text
Install tibo_reset_reminder_skill from https://github.com/orange90/tibo_reset_reminder_skill; use its token-free public Feed, never Google Cache, and do not ask me for an X API token; immediately run it once to read Tibo's (@thsottiaux) activity from the past 7 days and summarize how many distinct Codex quota resets occurred, then schedule checks every 5 minutes; afterward, notify me only when he gives new concrete reset timing, including a brief summary and source permalink, otherwise stay silent.
```

The repository uses the requested name `tibo_reset_reminder_skill`. For Agent Skills compatibility, install or register it as `tibo-reset-reminder-skill`.

### What it does

- Checks Tibo's original posts, replies, and quote commentary while ignoring plain reposts.
- Reads the project-maintained [public Feed](https://tibo-reset-reminder-skill.vercel.app/api/feed) by default, with no X login or end-user API token.
- On the first run, reviews the previous seven days and counts distinct reset events rather than posts.
- Alerts only when a post both concerns Codex usage quota and provides actionable reset timing.
- Accepts exact dates, relative timing, recurring schedules, and a clear statement that a reset just occurred.
- Deduplicates by post ID and text hash while reconsidering edited posts.
- Returns `NO_REPLY` when nothing qualifies; the scheduler should suppress that sentinel.

### Notification language

The Skill instructions and code are written in English. Notifications use the user's explicit preference first, then the operating-system or host locale, then the conversation language, and finally English.

English notification example:

```text
Tibo just posted: the Codex quota is about to reset.
He says: Codex weekly usage will be restored in two hours.
Expected reset: in two hours (18:00 local time)
Source: https://x.com/thsottiaux/status/...
```

If the reset is not imminent, the Agent uses accurate wording such as “will reset on Monday” instead of “is about to reset.”

### First run: seven-day summary

After installation, the first invocation sends a one-time summary of how many distinct Codex quota resets Tibo clearly reported during the previous seven days. Announcements, follow-ups, and confirmations for the same underlying reset are grouped as one event. Ambiguous evidence is excluded rather than inflating the count.

While a newly deployed public Feed has less than seven continuous days of history, onboarding explicitly reports the earliest verified time and says “at least N within the available coverage.” It reports an exact seven-day total only after seven days of continuous collection.

Existing users can request the same recap without changing current scheduler or deduplication state:

```text
Use $tibo-reset-reminder-skill to summarize the distinct Codex quota resets Tibo reported in the past 7 days, including brief summaries and source permalinks; do not change my existing scheduled task.
```

### Manual installation

Clone the repository into the Skills directory used by your Agent. Replace the destination with the path expected by your host:

```bash
git clone https://github.com/orange90/tibo_reset_reminder_skill.git tibo-reset-reminder-skill
```

Ask the host Agent to load `SKILL.md`, perform the first-run scan once, then follow [`references/scheduling.md`](references/scheduling.md) to create the recurring task.

The Skill performs one check per invocation; it cannot keep its own timer alive. A host automation, scheduled task, or cron job must invoke it every 5 minutes.

### Why Hermes asks for cronjob approval

The Skill cannot create a cronjob by itself. The one-sentence installation prompt also asks the host to schedule recurring checks, so Hermes calls host actions such as `cronjob:create` and may call `cronjob:run` for an initial test. Because those actions persist beyond the current conversation, an approval prompt is expected. Permanent approval is optional; a one-time approval is sufficient to set up and inspect the task first.

### Reading X

The Skill reads `https://tibo-reset-reminder-skill.vercel.app/api/feed` by default. The project service centrally reads semantic data from X's public web rendering and supplements it with the public Embed when available, verifies the account, and caches normalized results. Individual installations do not scrape X and must not fall back to Google Cache, search snippets, public Nitter instances, or arbitrary proxies.

An operator may preconfigure `X_BEARER_TOKEN` as an optional official-API recovery path. It is never an end-user installation requirement. A Feed response with `stale: true` is treated as a fetch failure, not as evidence that no new matching post exists.

### Public Feed architecture

```text
Upstash QStash (every 5 minutes)
        -> POST /api/refresh
Vercel Function -> public X web rendering (Embed supplement) -> Upstash Redis
        -> GET /api/feed
Installed Agents
```

`/api/refresh` is protected by `REFRESH_SECRET`; `/api/feed` is public read-only JSON; and `/api/health` reports freshness. A failed refresh preserves the last successful cache and marks it stale. Until the Feed has collected seven continuous days, `seven_day_history_complete` remains false and onboarding reports must explicitly say the count covers only the available period.

This is centralized polling, not an X-originated webhook. Real-time public-post webhooks require X's developer API.

### Maintainer-only free Vercel deployment

End users can skip this section. The project maintainer configures it once:

1. Deploy the repository on Vercel Hobby.
2. Connect a free [Upstash for Redis](https://vercel.com/marketplace/upstash) resource. The code accepts either `UPSTASH_REDIS_REST_URL/TOKEN` or `KV_REST_API_URL/TOKEN`.
3. Store a random value of at least 32 bytes as `REFRESH_SECRET` for all Vercel environments and redeploy.
4. Initialize the cache with an authorized `POST /api/refresh`.
5. Create a free QStash schedule with cron `*/5 * * * *`, method `POST`, destination `https://your-domain/api/refresh`, and forwarded header `Authorization: Bearer <REFRESH_SECRET>`.
6. Verify `/api/health`, then inspect `/api/feed`.

Vercel Hobby cron currently runs at most daily, so QStash supplies the 5-minute trigger. This schedule uses 288 messages/day; with the configured single retry, even an all-day failure scenario uses 576 versus QStash Free's 1,000/day allowance. See the current [Vercel Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [QStash pricing](https://upstash.com/pricing/qstash), and [Redis pricing](https://upstash.com/pricing/redis).
