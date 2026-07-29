# tibo_reset_reminder_skill

> 中文为主版本。 [English version](#english-version)

一个安静工作的 Agent Skill：定期查看 Tibo（[@thsottiaux](https://x.com/thsottiaux)）的最新 X 动态，只有当他明确提到 **Codex 额度什么时候重置** 时才提醒你。

## 一句话让 Agent 安装

把下面这句话直接发给支持安装 Skills 和定时任务的 Agent：

```text
请从 https://github.com/orange90/tibo_reset_reminder_skill 安装 tibo_reset_reminder_skill；安装后先运行一次，读取 Tibo（@thsottiaux）最近 7 天的 X 动态并总结 Codex 额度实际重置了几次，然后配置为每 15 分钟检查一次；以后只有发现新的明确重置时间时才提醒我，附上他的内容摘要和原帖链接，否则保持静默。
```

仓库使用你容易识别的名称 `tibo_reset_reminder_skill`；安装时，Agent 会按照 Agent Skills 规范将技能注册为 `tibo-reset-reminder-skill`。

## 它会做什么

- 检查 Tibo 的原创帖、回复和引用帖，忽略普通转推。
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
接下来我会每 15 分钟检查一次；没有新的重置信息时不会打扰你。
```

计数以“实际重置事件”为单位，而不是以推文数量为单位。同一次重置的预告、补充和确认不会被算成三次；证据不明确的内容也不会被强行计入。

## 安装与配置

### 让 Agent 自动安装

推荐直接使用上面的“一句话安装”。Agent 应完成以下操作：

1. 将本仓库克隆或复制到宿主支持的 Skills 目录，并将技能目录注册为 `tibo-reset-reminder-skill`。
2. 立即运行一次首次扫描，发送最近 7 天的重置次数摘要并完成初始化。
3. 创建每 15 分钟运行一次的 automation、scheduled task 或 cron job。
4. 为不同轮询任务提供持久化状态文件，例如通过 `TIBO_RESET_REMINDER_STATE` 指定路径。
5. 配置通知渠道，并抑制精确输出 `NO_REPLY`。

### 手动安装

把仓库克隆到你的 Agent 所使用的 Skills 目录。以下命令中的目标目录应替换为宿主实际路径：

```bash
git clone https://github.com/orange90/tibo_reset_reminder_skill.git tibo-reset-reminder-skill
```

然后让宿主 Agent 读取 `SKILL.md`，先执行一次首次扫描，再参考 [`references/scheduling.md`](references/scheduling.md) 创建定时任务。

> Skill 每次只执行一次检查，它本身不是常驻进程。15 分钟轮询必须由宿主的定时任务能力负责。

## 为什么 Hermes 会请求 cronjob 权限

Skill 本身不能创建 cronjob。上面的“一句话安装”同时要求了定时检查，所以 Hermes 会代表用户调用宿主的 `cronjob:create`，并可能调用 `cronjob:run` 做首次测试。这类操作会长期改变宿主状态，因此 Hermes 请求授权是正常的。

永久授权不是 Skill 的必要条件。你可以先单次批准，检查任务内容、执行频率和通知对象，确认无误后再决定是否永久授权。

## 获取 X 动态

Skill 支持两种方式：

- 优先使用 Agent 已登录的浏览器或网页读取工具，并通过 `x.com/thsottiaux/status/...` 永久链接核验内容。
- 设置 `X_BEARER_TOKEN` 后，使用 `scripts/fetch_x_posts.py` 调用官方 X API v2。

不要把 Bearer Token 写进提示词、仓库或日志。

## 目录结构

```text
.
├── SKILL.md
├── README.md
├── agents/openai.yaml
├── references/scheduling.md
└── scripts/
    ├── fetch_x_posts.py
    └── state_store.py
```

---

## English version

An intentionally quiet Agent Skill that checks Tibo's ([@thsottiaux](https://x.com/thsottiaux)) latest X activity and notifies you only when he clearly states **when the Codex quota will reset**.

### Install with one sentence

Send this sentence to an Agent that supports Skills and scheduled tasks:

```text
Install tibo_reset_reminder_skill from https://github.com/orange90/tibo_reset_reminder_skill; immediately run it once to read Tibo's (@thsottiaux) X activity from the past 7 days and summarize how many distinct Codex quota resets actually occurred, then schedule checks every 15 minutes; afterward, notify me only when he gives new concrete reset timing, including a brief summary and source permalink, otherwise stay silent.
```

The repository uses the requested name `tibo_reset_reminder_skill`. For Agent Skills compatibility, install or register it as `tibo-reset-reminder-skill`.

### What it does

- Checks Tibo's original posts, replies, and quote commentary while ignoring plain reposts.
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

### Manual installation

Clone the repository into the Skills directory used by your Agent. Replace the destination with the path expected by your host:

```bash
git clone https://github.com/orange90/tibo_reset_reminder_skill.git tibo-reset-reminder-skill
```

Ask the host Agent to load `SKILL.md`, perform the first-run scan once, then follow [`references/scheduling.md`](references/scheduling.md) to create the recurring task.

The Skill performs one check per invocation; it cannot keep its own timer alive. A host automation, scheduled task, or cron job must invoke it every 15 minutes.

### Why Hermes asks for cronjob approval

The Skill cannot create a cronjob by itself. The one-sentence installation prompt also asks the host to schedule recurring checks, so Hermes calls host actions such as `cronjob:create` and may call `cronjob:run` for an initial test. Because those actions persist beyond the current conversation, an approval prompt is expected. Permanent approval is optional; a one-time approval is sufficient to set up and inspect the task first.

### Reading X

The Skill can use an authenticated browser or web-reading tool. If `X_BEARER_TOKEN` is available, `scripts/fetch_x_posts.py` uses the official X API v2. Never place the token in prompts, the repository, or logs.
