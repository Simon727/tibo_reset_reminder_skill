# Scheduling and host integration

## Portable contract

Configure any scheduler or automation-capable Agent with these values:

- Interval: every 15 minutes, with no overlapping runs.
- Action: invoke `$tibo-reset-reminder-skill` for exactly one monitoring run.
- Persistent state: set `TIBO_RESET_REMINDER_STATE` to a writable JSON path that survives isolated runs.
- Credentials: optionally expose `X_BEARER_TOKEN` as a secret. Never paste it into the task prompt or logs.
- Delivery: forward only a positive alert to the user's chosen channel. Suppress the exact sentinel `NO_REPLY`.
- Timezone: provide the user's timezone to the task so relative or UTC reset times can be presented safely.

Recommended scheduled prompt:

```text
Use $tibo-reset-reminder-skill to perform one check of @thsottiaux's newest X posts and replies.
Look only for a concrete statement about when Codex usage quota or limits reset.
Use the persistent state path supplied by this automation. If there is a new qualifying post,
send one concise alert in the user's preferred language, falling back to the system or host locale,
with Tibo's statement summarized plus the reset timing and permalink. Otherwise return exactly NO_REPLY.
Do not send routine status, success, or heartbeat messages.
```

## Host setup

1. Copy the complete repository into the host's supported skills directory as `tibo-reset-reminder-skill`, or register that folder as an Agent Skill.
2. Create a recurring task in the host's automation system. A Skill cannot keep its own timer alive.
3. Give the task web/browser access, or configure an X developer bearer token for `scripts/fetch_x_posts.py`.
4. Map positive task output to the user's notification channel. Configure `NO_REPLY` as suppressed output.
5. Run once interactively, inspect the task log, then enable the 15-minute schedule.

If the host cannot suppress a sentinel, wrap the Agent invocation in its normal workflow tool and add a conditional delivery step: deliver only when output is non-empty and not equal to `NO_REPLY`.

## X API notes

The bundled fetcher uses the official X API v2 endpoints `GET /2/users/by/username/:username` and `GET /2/users/:id/tweets`. It includes replies and quote commentary but requests that plain reposts be excluded. Browser-based retrieval is a fallback because public X pages may require authentication or change their markup.

## Reliability rules

- Keep state on durable storage, not in a temporary working directory.
- Serialize runs or use a scheduler lock to prevent duplicate alerts.
- Treat network errors, authentication failures, and incomplete timelines as monitor failures, not negative matches.
- Keep diagnostic failures in task logs. Do not turn them into quota-reset alerts.
- Recheck edited posts because a post's text can change while its permalink remains related to the same conversation.
