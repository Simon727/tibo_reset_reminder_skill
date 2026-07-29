---
name: tibo-reset-reminder-skill
description: Monitor Tibo Louis-Charles (@thsottiaux) on X for Codex quota-reset information, produce a one-time seven-day reset-count summary on the first run, then deduplicate checks and notify the user only when a new concrete reset time or actionable reset schedule appears. Use for installing or onboarding this monitor, recurring scheduled checks such as every 15 minutes, ad hoc Codex quota-reset checks, or configuring a silent-unless-matched monitoring task.
---

# Tibo Reset Reminder Skill

Watch <https://x.com/thsottiaux> for Codex quota-reset timing. Keep routine runs silent and send at most one alert per qualifying post version.

## Run contract

- Treat `@thsottiaux` as the only authoritative source for this monitor.
- Inspect original posts, replies, and quote-post commentary by this account. Ignore plain reposts.
- Scan the previous seven days once during onboarding. After onboarding, prefer the newest 20 items on each recurring run.
- Persist state outside the skill directory. Use `TIBO_RESET_REMINDER_STATE` when set; otherwise use a stable path supplied by the scheduler.
- Never interpret fetch failure as evidence that no matching post exists. Record the failure in task logs, but do not send the user a quota alert.
- In a scheduled run, emit exactly `NO_REPLY` when there is no new qualifying information. The scheduler must suppress delivery of this sentinel.

## Select the run mode

Check durable state before fetching posts:

```bash
python3 scripts/state_store.py status --state "$TIBO_RESET_REMINDER_STATE"
```

- If `initialized` is `false`, perform the first-run onboarding flow.
- If `initialized` is `true`, perform the recurring monitoring flow.
- If the user explicitly requests a seven-day recap, perform the same historical fetch, grouping, and summary even when state is already initialized. In that manual mode, leave existing initialization and deduplication state unchanged.
- Treat an older state file that already contains seen or notified posts as initialized. Do not surprise an existing installation with a retroactive onboarding summary after an upgrade.

## First-run onboarding

The Skill cannot execute merely because its files were copied. Run this flow on the first invocation after installation.

1. Fetch Tibo's original posts, replies, and quote commentary from the previous seven 24-hour periods. When `X_BEARER_TOKEN` exists, run:

   ```bash
   python3 scripts/fetch_x_posts.py --username thsottiaux --max-results 100 --lookback-days 7 > week-posts.json
   ```

   Otherwise use the host's authenticated browser, web-reading, or search tools. Verify each candidate against its `x.com/thsottiaux/status/...` permalink. Do not rely on a search-result snippet alone. Normalize the verified items to `id`, `text`, `created_at`, and `url`, then save the complete array as `week-posts.json` for state initialization.

2. Identify completed Codex quota-reset events in that window.
   - Require an explicit statement that a reset occurred, completed, or took effect, or a confirmed reset time that falls inside the seven-day window.
   - Exclude vague plans, speculation, other products, API rate limits, billing credits, and future reset times outside the window.
   - Group multiple posts or replies about the same underlying reset as one event. Use the effective reset time, quota type, and conversation context. Do not count an announcement, follow-up, and confirmation of the same reset as three resets.
   - Keep distinct quota windows separate when Tibo clearly describes separate reset events, such as a short rolling allowance and a weekly allowance.
   - When the evidence is ambiguous, exclude it from the count rather than inflating the result.

3. Send one localized onboarding summary even when the count is zero. Include the total number of distinct resets, a short dated line for each event, and one or more source permalinks. Clearly label inference.

   Chinese pattern:

   ```text
   首次扫描完成：过去 7 天，Tibo 明确提到 Codex 额度重置共【N】次。
   【日期/时间】—【事件摘要】—【来源链接】
   接下来我会每 15 分钟检查一次；没有新的重置信息时不会打扰你。
   ```

   English pattern:

   ```text
   Initial scan complete: in the past 7 days, Tibo clearly reported [N] distinct Codex quota resets.
   [Date/time] — [event summary] — [source permalink]
   I will now check every 15 minutes and stay silent unless new reset information appears.
   ```

4. After the summary has been delivered successfully, mark every fetched post seen and complete onboarding atomically:

   ```bash
   python3 scripts/state_store.py mark-initialized --state "$TIBO_RESET_REMINDER_STATE" --input week-posts.json
   ```

   Do not mark initialization complete if fetching, analysis, or delivery fails. Retry onboarding on the next invocation. Do not send individual alerts for historical posts after the summary.

## Recurring monitoring flow

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

5. Choose the notification language without asking on every run. Apply the same language choice to onboarding summaries. Use this priority order:
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

This skill performs one check; it cannot create or keep a background timer by itself. The host owns scheduler creation and may require the user's approval before creating a cronjob. Run onboarding once, then configure the host to invoke the recurring flow every 15 minutes with a persistent state path and a notification destination. Read [references/scheduling.md](references/scheduling.md) when installing or scheduling the monitor.

The official API fetcher uses X API v2's username lookup and user-post timeline. If API access is unavailable, retain the same evaluation and deduplication rules with the host's browsing tools.
