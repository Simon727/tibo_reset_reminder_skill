import {
  HISTORY_DAYS,
  MAX_STORED_POSTS,
  TARGET_USERNAME,
} from "./config.js";

function postVersion(post) {
  return post.id + "\u0000" + post.text;
}

function createdTime(post) {
  const milliseconds = Date.parse(post.created_at || "");
  return Number.isNaN(milliseconds) ? 0 : milliseconds;
}

export function mergeFeed(previous, incoming, fetchedAt = new Date()) {
  const oldPosts = Array.isArray(previous && previous.posts)
    ? previous.posts
    : [];
  const oldVersions = new Set(oldPosts.map(postVersion));
  const oldIds = new Set(oldPosts.map((post) => post.id));
  const byId = new Map(oldPosts.map((post) => [post.id, post]));
  for (const post of incoming) {
    byId.set(post.id, post);
  }

  const cutoff = fetchedAt.valueOf() - HISTORY_DAYS * 24 * 60 * 60 * 1_000;
  const posts = [...byId.values()]
    .filter((post) => !createdTime(post) || createdTime(post) >= cutoff)
    .sort((left, right) => {
      const timeDifference = createdTime(right) - createdTime(left);
      if (timeDifference) {
        return timeDifference;
      }
      try {
        return Number(BigInt(right.id) - BigInt(left.id));
      } catch {
        return right.id.localeCompare(left.id);
      }
    })
    .slice(0, MAX_STORED_POSTS);

  const fetchedAtIso = fetchedAt.toISOString();
  const continuousCollectionSince =
    previous && previous.continuous_collection_since
      ? previous.continuous_collection_since
      : fetchedAtIso;
  const continuousStart = Date.parse(continuousCollectionSince);
  const continuousCoverageDays = Number.isNaN(continuousStart)
    ? 0
    : Math.max(
        0,
        (fetchedAt.valueOf() - continuousStart) / (24 * 60 * 60 * 1_000),
      );
  const coverageDates = posts
    .map((post) => post.created_at)
    .filter((value) => !Number.isNaN(Date.parse(value || "")));
  return {
    feed: {
      version: 1,
      source: {
        platform: "x",
        username: TARGET_USERNAME,
        profile_url: "https://x.com/" + TARGET_USERNAME,
        retrieval: "public-web",
      },
      history_days: HISTORY_DAYS,
      available_from:
        coverageDates.sort((left, right) => left.localeCompare(right))[0] ||
        null,
      continuous_collection_since: continuousCollectionSince,
      continuous_coverage_days: Number(continuousCoverageDays.toFixed(3)),
      seven_day_history_complete: continuousCoverageDays >= 7,
      fetched_at: fetchedAtIso,
      last_attempt_at: fetchedAtIso,
      last_success_at: fetchedAtIso,
      stale: false,
      consecutive_failures: 0,
      posts,
    },
    added: incoming.filter((post) => !oldIds.has(post.id)).map((post) => post.id),
    updated: incoming
      .filter(
        (post) =>
          oldIds.has(post.id) && !oldVersions.has(postVersion(post)),
      )
      .map((post) => post.id),
  };
}

export function markFeedFailure(previous, error, attemptedAt = new Date()) {
  if (!previous || !Array.isArray(previous.posts)) {
    return null;
  }
  return {
    ...previous,
    last_attempt_at: attemptedAt.toISOString(),
    stale: true,
    consecutive_failures: Number(previous.consecutive_failures || 0) + 1,
    last_error: String(error && error.message ? error.message : error).slice(
      0,
      240,
    ),
  };
}
