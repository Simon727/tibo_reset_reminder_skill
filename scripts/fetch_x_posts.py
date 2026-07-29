#!/usr/bin/env python3
"""Fetch and normalize recent posts from a public X account via X API v2."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


API_BASE = "https://api.x.com/2"


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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--username", default="thsottiaux")
    parser.add_argument("--max-results", type=int, default=20)
    parser.add_argument("--since-id")
    args = parser.parse_args()

    if not 5 <= args.max_results <= 100:
        parser.error("--max-results must be between 5 and 100")

    token = os.environ.get("X_BEARER_TOKEN")
    if not token:
        print("X_BEARER_TOKEN is required", file=sys.stderr)
        return 2

    username = args.username.lstrip("@")
    try:
        user_payload = api_get(
            f"/users/by/username/{urllib.parse.quote(username, safe='')}", token
        )
        user = user_payload.get("data") or {}
        user_id = user.get("id")
        if not user_id:
            raise RuntimeError(f"X user lookup did not return an ID: {user_payload}")

        params = {
            "max_results": str(args.max_results),
            "exclude": "retweets",
            "tweet.fields": "created_at,referenced_tweets,note_tweet",
        }
        if args.since_id:
            params["since_id"] = args.since_id
        payload = api_get(f"/users/{user_id}/tweets", token, params)
        posts = [normalize(post, username) for post in payload.get("data", [])]
        json.dump(posts, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return 0
    except (RuntimeError, KeyError, TypeError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
