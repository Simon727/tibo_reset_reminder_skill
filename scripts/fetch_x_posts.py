#!/usr/bin/env python3
"""Fetch normalized posts from the public project Feed or X API v2."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone


API_BASE = "https://api.x.com/2"
DEFAULT_PUBLIC_FEED_URL = (
    "https://tibo-reset-reminder-skill.vercel.app/api/feed"
)


def api_get(path: str, token: str, params: dict[str, str] | None = None) -> dict:
    url = f"{API_BASE}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "User-Agent": "tibo-reset-reminder-skill/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"X API returned HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not reach X API: {exc.reason}") from exc


def public_feed_get(url: str) -> dict:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "tibo-reset-reminder-skill/2.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Tibo public Feed returned HTTP {exc.code}: {detail[:300]}"
        ) from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not reach Tibo public Feed: {exc.reason}") from exc


def full_text(post: dict) -> str:
    note = post.get("note_tweet")
    if isinstance(note, dict) and isinstance(note.get("text"), str):
        return note["text"]
    return str(post.get("text", ""))


def normalize(post: dict, username: str) -> dict:
    references = post.get("referenced_tweets") or []
    kinds = {ref.get("type") for ref in references if isinstance(ref, dict)}
    if "replied_to" in kinds:
        kind = "reply"
    elif "quoted" in kinds:
        kind = "quote"
    else:
        kind = "post"
    post_id = str(post["id"])
    return {
        "id": post_id,
        "text": full_text(post),
        "created_at": post.get("created_at"),
        "url": f"https://x.com/{username}/status/{post_id}",
        "kind": kind,
    }


def fetch_from_public_feed(
    url: str,
    username: str,
    max_results: int,
    since_id: str | None,
    lookback_days: float | None,
) -> list[dict]:
    payload = public_feed_get(url)
    source = payload.get("source") or {}
    if str(source.get("username", "")).lower() != username.lower():
        raise RuntimeError("Tibo public Feed returned an unexpected source account")
    if payload.get("stale"):
        last_success = payload.get("last_success_at") or "unknown"
        raise RuntimeError(
            f"Tibo public Feed is stale; last successful refresh: {last_success}"
        )
    if lookback_days is not None:
        try:
            continuous_days = float(payload.get("continuous_coverage_days", 0))
        except (TypeError, ValueError):
            continuous_days = 0
        if continuous_days < lookback_days:
            print(
                "Warning: public Feed continuous history is only "
                f"{continuous_days:.2f} days; label a {lookback_days:g}-day "
                "summary as partial coverage.",
                file=sys.stderr,
            )

    raw_posts = payload.get("posts")
    if not isinstance(raw_posts, list):
        raise RuntimeError("Tibo public Feed did not return a posts array")

    cutoff = None
    if lookback_days is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    normalized = []
    for post in raw_posts:
        if not isinstance(post, dict) or "id" not in post or "text" not in post:
            continue
        post_id = str(post["id"])
        if since_id is not None:
            try:
                if int(post_id) <= int(since_id):
                    continue
            except ValueError as exc:
                raise RuntimeError("Post IDs from the public Feed must be numeric") from exc
        if cutoff is not None:
            created_at = post.get("created_at")
            if not created_at:
                continue
            try:
                created = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
            except ValueError:
                continue
            if created < cutoff:
                continue
        normalized.append(
            {
                "id": post_id,
                "text": str(post["text"]),
                "created_at": post.get("created_at"),
                "url": str(
                    post.get("url")
                    or f"https://x.com/{username}/status/{post_id}"
                ),
                "kind": str(post.get("kind") or "post"),
            }
        )
    return normalized[:max_results]


def fetch_from_x_api(
    token: str,
    username: str,
    max_results: int,
    since_id: str | None,
    lookback_days: float | None,
) -> list[dict]:
    user_payload = api_get(
        f"/users/by/username/{urllib.parse.quote(username, safe='')}", token
    )
    user = user_payload.get("data") or {}
    user_id = user.get("id")
    if not user_id:
        raise RuntimeError(f"X user lookup did not return an ID: {user_payload}")

    params = {
        "max_results": str(max_results),
        "exclude": "retweets",
        "tweet.fields": "created_at,referenced_tweets,note_tweet",
    }
    if since_id:
        params["since_id"] = since_id
    if lookback_days is not None:
        start_time = datetime.now(timezone.utc) - timedelta(days=lookback_days)
        params["start_time"] = start_time.replace(microsecond=0).isoformat().replace(
            "+00:00", "Z"
        )
    payload = api_get(f"/users/{user_id}/tweets", token, params)
    return [normalize(post, username) for post in payload.get("data", [])]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--username", default="thsottiaux")
    parser.add_argument("--max-results", type=int, default=20)
    parser.add_argument("--since-id")
    parser.add_argument(
        "--source",
        choices=("auto", "feed", "x-api"),
        default="auto",
        help="Use the token-free public Feed by default; optionally force X API v2",
    )
    parser.add_argument(
        "--feed-url",
        default=os.environ.get("TIBO_RESET_FEED_URL", DEFAULT_PUBLIC_FEED_URL),
    )
    parser.add_argument(
        "--lookback-days",
        type=float,
        help="Only request posts created within this many days of the current UTC time",
    )
    args = parser.parse_args()

    if not 5 <= args.max_results <= 100:
        parser.error("--max-results must be between 5 and 100")
    if args.lookback_days is not None and args.lookback_days <= 0:
        parser.error("--lookback-days must be greater than zero")

    username = args.username.lstrip("@")
    try:
        token = os.environ.get("X_BEARER_TOKEN")
        posts = None
        feed_error = None
        if args.source in ("auto", "feed"):
            try:
                posts = fetch_from_public_feed(
                    args.feed_url,
                    username,
                    args.max_results,
                    args.since_id,
                    args.lookback_days,
                )
            except RuntimeError as exc:
                feed_error = exc
                if args.source == "feed":
                    raise
        if posts is None:
            if not token:
                if feed_error:
                    raise feed_error
                raise RuntimeError("X_BEARER_TOKEN is required when --source=x-api")
            posts = fetch_from_x_api(
                token,
                username,
                args.max_results,
                args.since_id,
                args.lookback_days,
            )
        json.dump(posts, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return 0
    except (RuntimeError, KeyError, TypeError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
