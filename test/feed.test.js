import assert from "node:assert/strict";
import test from "node:test";

import { mergeFeed } from "../lib/feed.js";
import {
  parsePublicProfileHtml,
  parseSyndicationHtml,
} from "../lib/syndication.js";

function fixture(payload) {
  return (
    '<!doctype html><script id="__NEXT_DATA__" type="application/json">' +
    JSON.stringify(payload) +
    "</script>"
  );
}

test("parses verified target posts and excludes reposts and quoted authors", () => {
  const payload = {
    pageProps: {
      timeline: [
        {
          rest_id: "1900000000000000001",
          core: {
            user_results: { result: { legacy: { screen_name: "thsottiaux" } } },
          },
          legacy: {
            full_text: "Codex limits reset in two hours &amp; then weekly.",
            created_at: "Tue Jul 29 08:00:00 +0000 2026",
            quoted_status_id_str: "1800000000000000000",
          },
        },
        {
          rest_id: "1900000000000000002",
          core: {
            user_results: { result: { legacy: { screen_name: "someone_else" } } },
          },
          legacy: {
            full_text: "A quoted post",
            created_at: "Tue Jul 29 07:00:00 +0000 2026",
          },
        },
        {
          rest_id: "1900000000000000003",
          core: {
            user_results: { result: { legacy: { screen_name: "thsottiaux" } } },
          },
          legacy: {
            full_text: "Plain repost",
            created_at: "Tue Jul 29 06:00:00 +0000 2026",
            retweeted_status_id_str: "1700000000000000000",
          },
        },
      ],
    },
  };
  assert.deepEqual(parseSyndicationHtml(fixture(payload)), [
    {
      id: "1900000000000000001",
      text: "Codex limits reset in two hours & then weekly.",
      created_at: "2026-07-29T08:00:00.000Z",
      url: "https://x.com/thsottiaux/status/1900000000000000001",
      kind: "quote",
    },
  ]);
});

test("parses semantic metadata from the public X profile", () => {
  const html =
    '<article data-tweet-id="1900000000000000004">' +
    '<meta content="2026-07-29T10:00:00.000Z" itemProp="datePublished"/>' +
    '<meta content="Limits reset &amp; Codex is back. It&#x27;s live." itemProp="articleBody"/>' +
    '<meta content="thsottiaux" itemProp="alternateName"/>' +
    "</article>" +
    '<article data-tweet-id="1900000000000000005">' +
    '<meta content="2026-07-29T09:00:00.000Z" itemProp="datePublished"/>' +
    '<meta content="Quoted text" itemProp="articleBody"/>' +
    '<meta content="someone_else" itemProp="alternateName"/>' +
    "</article>";
  assert.deepEqual(parsePublicProfileHtml(html), [
    {
      id: "1900000000000000004",
      text: "Limits reset & Codex is back. It's live.",
      created_at: "2026-07-29T10:00:00.000Z",
      url: "https://x.com/thsottiaux/status/1900000000000000004",
      kind: "post",
    },
  ]);
});

test("merges edited posts, reports additions, and preserves history", () => {
  const previous = {
    posts: [
      {
        id: "1900000000000000001",
        text: "Old wording",
        created_at: "2026-07-29T08:00:00.000Z",
      },
    ],
  };
  const incoming = [
    {
      id: "1900000000000000001",
      text: "Edited wording",
      created_at: "2026-07-29T08:00:00.000Z",
    },
    {
      id: "1900000000000000002",
      text: "New post",
      created_at: "2026-07-29T09:00:00.000Z",
    },
  ];
  const result = mergeFeed(previous, incoming, new Date("2026-07-29T10:00:00Z"));
  assert.deepEqual(result.added, ["1900000000000000002"]);
  assert.deepEqual(result.updated, ["1900000000000000001"]);
  assert.deepEqual(
    result.feed.posts.map((post) => post.text),
    ["New post", "Edited wording"],
  );
  assert.equal(result.feed.stale, false);
});
