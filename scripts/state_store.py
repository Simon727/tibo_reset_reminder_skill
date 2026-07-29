#!/usr/bin/env python3
"""Maintain durable seen/notified state for tibo-reset-reminder-skill."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path


MAX_ENTRIES = 2000


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def version_key(post_id: str, text: str) -> str:
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:20]
    return f"{post_id}:{digest}"


def load_state(path: Path) -> dict:
    if not path.exists():
        return {"version": 1, "seen": {}, "notified": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Cannot read state file {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise RuntimeError(f"State file {path} must contain a JSON object")
    data.setdefault("version", 1)
    data.setdefault("seen", {})
    data.setdefault("notified", {})
    return data


def trim(entries: dict) -> dict:
    if len(entries) <= MAX_ENTRIES:
        return entries
    return dict(
        sorted(entries.items(), key=lambda item: item[1].get("at", ""))[-MAX_ENTRIES:]
    )


def save_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    state["seen"] = trim(state["seen"])
    state["notified"] = trim(state["notified"])
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(state, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
        os.replace(temp_name, path)
    except BaseException:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass
        raise


def read_posts(input_path: str) -> list[dict]:
    if input_path == "-":
        data = json.load(sys.stdin)
    else:
        with open(input_path, encoding="utf-8") as handle:
            data = json.load(handle)
    if not isinstance(data, list):
        raise RuntimeError("Post input must be a JSON array")
    posts = []
    for post in data:
        if not isinstance(post, dict) or "id" not in post or "text" not in post:
            raise RuntimeError("Every post must contain id and text")
        posts.append(post)
    return posts


def entry(post_id: str, text: str) -> dict:
    return {"post_id": post_id, "text_hash": version_key(post_id, text).split(":", 1)[1], "at": now()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    filter_parser = subparsers.add_parser("filter-new")
    filter_parser.add_argument("--state", required=True)
    filter_parser.add_argument("--input", default="-")

    seen_parser = subparsers.add_parser("mark-seen")
    seen_parser.add_argument("--state", required=True)
    seen_parser.add_argument("--input", default="-")

    notified_parser = subparsers.add_parser("mark-notified")
    notified_parser.add_argument("--state", required=True)
    notified_parser.add_argument("--post-id", required=True)
    text_group = notified_parser.add_mutually_exclusive_group(required=True)
    text_group.add_argument("--text")
    text_group.add_argument("--text-file")
    text_group.add_argument("--input")

    args = parser.parse_args()
    path = Path(args.state).expanduser()

    try:
        state = load_state(path)
        if args.command == "filter-new":
            posts = read_posts(args.input)
            unseen = [
                post
                for post in posts
                if version_key(str(post["id"]), str(post["text"])) not in state["seen"]
            ]
            json.dump(unseen, sys.stdout, ensure_ascii=False, indent=2)
            sys.stdout.write("\n")
            return 0

        if args.command == "mark-seen":
            posts = read_posts(args.input)
            for post in posts:
                post_id, text = str(post["id"]), str(post["text"])
                state["seen"][version_key(post_id, text)] = entry(post_id, text)
            save_state(path, state)
            print(f"marked-seen:{len(posts)}")
            return 0

        if args.input:
            matches = [
                post
                for post in read_posts(args.input)
                if str(post["id"]) == str(args.post_id)
            ]
            if len(matches) != 1:
                raise RuntimeError(
                    f"Expected exactly one post with ID {args.post_id}; found {len(matches)}"
                )
            text = str(matches[0]["text"])
        elif args.text_file:
            text = Path(args.text_file).read_text(encoding="utf-8")
        else:
            text = args.text
        key = version_key(str(args.post_id), text)
        if key in state["notified"]:
            print("already-notified")
            return 3
        state["notified"][key] = entry(str(args.post_id), text)
        state["seen"][key] = entry(str(args.post_id), text)
        save_state(path, state)
        print("reserved-notification")
        return 0
    except (OSError, RuntimeError, json.JSONDecodeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
