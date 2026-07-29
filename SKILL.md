---
name: tibo-reset-reminder-skill
description: Monitor Tibo Louis-Charles (@thsottiaux) on X for new posts or replies that state when Codex usage limits, quota, or allowance will reset; deduplicate checks and notify the user only when a concrete reset time or actionable reset schedule is found. Use for recurring scheduled checks (such as every 15 minutes), ad hoc Codex quota-reset checks, or configuring a silent-unless-matched monitoring task.
---

# Tibo Reset Reminder Skill

Watch <https://x.com/thsottiaux> for Codex quota-reset timing. Keep routine runs silent and send at most one alert per qualifying post version.

## Run contract

- Treat `@thsottiaux` as the only authoritative source for this monitor.
- Inspect original posts, replies, and quote-post commentary by this account. Ignore plain reposts.
- Prefer the newest 20 items. On the first run, do not alert on items older than 72 hours unless the user explicitly requests a historical scan.
- Persist state outside the skill directory. Use `TIBO_RESET_REMINDER_STATE` when set; otherwise use a stable path supplied by the scheduler.
- Never interpret fetch failure as evidence that no matching post exists. Record the failure in task logs, but do not send the user a quota alert.
- In a scheduled run, emit exactly `NO_REPLY` when there is no new qualifying information. The scheduler must suppress delivery of this sentinel.

## One monitoring run

1. Fetch recent items.
   - When `X_BEARER_TOKEN` exists, run:

     ```bash
     python3 scripts/fetch_x_posts.py --username thsottiaux --max-results 20 > posts.json
     ```

   - Otherwise use the host's authenticated browser, web-reading, or search tools. Open the profile and verify every candidate against its `x.com/thsottiaux/status/...` permalink. Do not rely on a search-result snippet alone.
   - Normalize each item to `id`, `text`, `created_at`, and `url`. Preserve the full text of replies and long-form posts when available.

2. Remove already processed post versions. If Python is available, run:

   ```bash
   python3 scripts/state_store.py filter-new --state "$TIBO_RESET_REMINDER_STATE" --input posts.json > new-posts.json
   ```

   A post version is identified by its post ID plus a hash of its text, so an edited post can be reconsidered.

3. Evaluate each new item semantically. Alert only when both conditions hold:
   - The item refers to Codex usage limits, quota, allowance, cap, or equivalent access restrictions.
   - The item gives actionable reset timing: an exact time/date, a relative time such as "in two hours" or "tomorrow," a recurring schedule such as "every Monday," or a clear statement that a reset has just occurred.

   Accept context carried across a short reply chain only when the linked parent clearly concerns Codex quota. Reject generic mentions of "reset," API rate limits, billing credits, another product's quota, speculation from other users, or vague statements such as "soon." When uncertain, do not alert.

4. Before sending a qualifying alert, reserve it for at-most-once delivery:

   ```bash
   python3 scripts/state_store.py mark-notified --state "$TIBO_RESET_REMINDER_STATE" --post-id POST_ID --input new-posts.json
   ```

   If the command reports `already-notified`, do not alert again.

5. Choose the notification language without asking on every run. Use this priority order:
   - An explicit language preference from the user or automation configuration.
   - The operating system or host locale.
   - The language used in the current conversation.
   - English as the fallback.

6. Send one concise localized message. Keep the meaning natural in the selected language rather than translating word for word. Include Tibo's statement as a short summary, the reset timing, and the source permalink.

   Use this Chinese pattern when the selected language is Chinese:

   ```text
   Tibo 发了推特：Codex 额度马上要重置了。
   他说：【内容摘要】
   预计重置时间：【原始时间表述；如能可靠换算，再附用户当地时间】
   来源：【X 帖子永久链接】
   ```

   Use this English pattern when the selected language is English:

   ```text
   Tibo just posted: the Codex quota is about to reset.
   He says: [brief summary]
   Expected reset: [source timing; add the user's local time only when conversion is reliable]
   Source: [permalink]
   ```

   Adapt the opening when the reset is not actually imminent, for example "will reset on Monday" rather than "is about to reset." Distinguish direct statements from reasonable inference. Do not overstate timezone conversions when the source omits a timezone.

7. After all new items have been evaluated, mark them seen:

   ```bash
   python3 scripts/state_store.py mark-seen --state "$TIBO_RESET_REMINDER_STATE" --input new-posts.json
   ```

8. If no alert was sent, return `NO_REPLY` and nothing else.

## Scheduling

This skill performs one check; it does not create a background timer by itself. Configure the host to invoke it every 15 minutes with a persistent state path and a notification destination. Read [references/scheduling.md](references/scheduling.md) when installing or scheduling the monitor.

The official API fetcher uses X API v2's username lookup and user-post timeline. If API access is unavailable, retain the same evaluation and deduplication rules with the host's browsing tools.
