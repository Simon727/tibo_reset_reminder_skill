# Scheduling and host integration

## Portable contract

Configure any scheduler or automation-capable Agent with these values:

- Interval: every 5 minutes, with no overlapping runs.
- Onboarding: invoke `$tibo-reset-reminder-skill` once immediately after installation so it can summarize distinct resets from the previous seven days and initialize state.
- Recurring action: invoke `$tibo-reset-reminder-skill` for exactly one monitoring run.
- Persistent state: set `TIBO_RESET_REMINDER_STATE` to a writable JSON path that survives isolated runs.
- Feed: use the built-in public Feed URL. No X credential is required from the installing user. Set `TIBO_RESET_FEED_URL` only when intentionally using a self-hosted mirror.
- Delivery: forward only a positive alert to the user's chosen channel. Suppress the exact sentinel `NO_REPLY`.
- Timezone: provide the user's timezone to the task so relative or UTC reset times can be presented safely.

Recommended scheduled prompt:

```text
Use $tibo-reset-reminder-skill to perform one check of @thsottiaux's newest X posts and replies.
If the persistent state is not initialized, first scan the previous seven days, count distinct
completed Codex quota-reset events rather than matching posts, send one localized onboarding
summary even when the count is zero, and if seven_day_history_complete is false label the count
as partial coverage with the earliest verified time; then mark the fetched posts seen and complete initialization.
Otherwise perform the normal recurring check below.
Look only for a concrete statement about when Codex usage quota or limits reset.
Use the persistent state path supplied by this automation. If there is a new qualifying post,
send one concise alert in the user's preferred language, falling back to the system or host locale,
with Tibo's statement summarized plus the reset timing and permalink. Otherwise return exactly NO_REPLY.
Do not send routine status, success, or heartbeat messages.
```

## Host setup

1. Copy the complete repository into the host's supported skills directory as `tibo-reset-reminder-skill`, or register that folder as an Agent Skill.
2. Give the task outbound HTTPS access so `scripts/fetch_x_posts.py` can read the project-maintained public Feed. Do not ask the user to log in to X or provide an X API token.
3. Run once interactively and confirm the seven-day onboarding summary was delivered.
4. Create a recurring task in the host's automation system. A Skill cannot create or keep its own timer alive; the host may require user approval for this persistent action.
5. Map positive task output to the user's notification channel. Configure `NO_REPLY` as suppressed output.
6. Inspect the task log, then enable the 15-minute schedule.

If the host cannot suppress a sentinel, wrap the Agent invocation in its normal workflow tool and add a conditional delivery step: deliver only when output is non-empty and not equal to `NO_REPLY`.

## Public Feed notes

The default Feed is `https://tibo-reset-reminder-skill.vercel.app/api/feed`. The project service reads semantic metadata from X's public profile rendering, supplements it with the public Embed when available, validates that posts belong to `@thsottiaux`, excludes plain reposts, and caches normalized results. This keeps X retrieval out of individual Agent installations.

The bundled fetcher can use X API v2 only when an operator has already supplied `X_BEARER_TOKEN`; this is an optional recovery path, not an installation requirement. Never replace a failed Feed fetch with Google Cache, search snippets, Nitter, or an arbitrary proxy.

## Reliability rules

- Keep state on durable storage, not in a temporary working directory.
- Serialize runs or use a scheduler lock to prevent duplicate alerts.
- Treat network errors, authentication failures, and incomplete timelines as monitor failures, not negative matches.
- Treat a Feed response with `stale: true` as a fetch failure. Do not silently evaluate an old snapshot as if it were current.
- Keep diagnostic failures in task logs. Do not turn them into quota-reset alerts.
- Recheck edited posts because a post's text can change while its permalink remains related to the same conversation.
