import { TARGET_USERNAME } from "./config.js";

const REQUEST_TIMEOUT_MS = 12_000;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

function htmlEntityDecode(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, digits) =>
      String.fromCodePoint(Number.parseInt(digits, 16)),
    )
    .replace(/&#([0-9]+);/g, (_, digits) =>
      String.fromCodePoint(Number.parseInt(digits, 10)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(
    /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
  )) {
    result[match[1].toLowerCase()] = htmlEntityDecode(match[2] ?? match[3]);
  }
  return result;
}

export function parsePublicProfileHtml(
  html,
  expectedUsername = TARGET_USERNAME,
) {
  const posts = new Map();
  for (const match of String(html).matchAll(
    /<article\b[^>]*data-tweet-id=["'](\d+)["'][^>]*>([\s\S]*?)<\/article>/gi,
  )) {
    const id = match[1];
    const body = match[2];
    const metadata = {};
    for (const tagMatch of body.matchAll(/<meta\b[^>]*>/gi)) {
      const values = attributes(tagMatch[0]);
      const key = String(values.itemprop || "").toLowerCase();
      if (key && values.content !== undefined && metadata[key] === undefined) {
        metadata[key] = values.content;
      }
    }
    if (
      normalizeUsername(metadata.alternatename) !==
      normalizeUsername(expectedUsername)
    ) {
      continue;
    }
    const text = metadata.articlebody || metadata.text || metadata.headline;
    const createdAt = metadata.datepublished || metadata.datecreated;
    if (!text || !createdAt || Number.isNaN(Date.parse(createdAt))) {
      continue;
    }
    posts.set(id, {
      id,
      text,
      created_at: new Date(createdAt).toISOString(),
      url: "https://x.com/" + expectedUsername + "/status/" + id,
      kind: "post",
    });
  }
  const normalized = [...posts.values()].sort((left, right) =>
    right.created_at.localeCompare(left.created_at),
  );
  if (!normalized.length) {
    throw new Error(
      "X public profile returned no verified posts for @" + expectedUsername,
    );
  }
  return normalized;
}

function findNextData(html) {
  const patterns = [
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
    /<script[^>]*type=["']application\/json["'][^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  throw new Error("X public Embed response did not contain timeline data");
}

function getPath(object, path) {
  let value = object;
  for (const part of path) {
    if (!value || typeof value !== "object") {
      return undefined;
    }
    value = value[part];
  }
  return value;
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim());
}

function tweetCandidate(object, expectedUsername) {
  if (!object || typeof object !== "object" || Array.isArray(object)) {
    return null;
  }

  const legacy =
    object.legacy && typeof object.legacy === "object" ? object.legacy : object;
  const id = firstString(object.rest_id, object.id_str, legacy.id_str);
  const text = firstString(
    getPath(object, ["note_tweet", "note_tweet_results", "result", "text"]),
    getPath(object, ["note_tweet_results", "result", "text"]),
    object.full_text,
    legacy.full_text,
    object.text,
    legacy.text,
  );
  const username = firstString(
    getPath(object, [
      "core",
      "user_results",
      "result",
      "legacy",
      "screen_name",
    ]),
    getPath(object, ["core", "user_results", "result", "core", "screen_name"]),
    getPath(object, ["user", "legacy", "screen_name"]),
    getPath(object, ["user", "screen_name"]),
    getPath(object, ["author", "username"]),
  );

  if (
    !id ||
    !/^\d{5,}$/.test(id) ||
    !text ||
    normalizeUsername(username) !== normalizeUsername(expectedUsername)
  ) {
    return null;
  }

  if (
    legacy.retweeted_status_result ||
    legacy.retweeted_status_id_str ||
    object.retweeted_status
  ) {
    return null;
  }

  const rawCreatedAt = firstString(object.created_at, legacy.created_at);
  const parsedCreatedAt = rawCreatedAt ? new Date(rawCreatedAt) : null;
  const createdAt =
    parsedCreatedAt && !Number.isNaN(parsedCreatedAt.valueOf())
      ? parsedCreatedAt.toISOString()
      : null;
  const kind = legacy.in_reply_to_status_id_str
    ? "reply"
    : legacy.quoted_status_id_str || object.quoted_status_result
      ? "quote"
      : "post";

  return {
    id,
    text: htmlEntityDecode(text),
    created_at: createdAt,
    url: "https://x.com/" + expectedUsername + "/status/" + id,
    kind,
  };
}

export function parseSyndicationHtml(
  html,
  expectedUsername = TARGET_USERNAME,
) {
  let data;
  const source = findNextData(html);
  try {
    data = JSON.parse(source);
  } catch (error) {
    throw new Error("X public Embed timeline data was not valid JSON", {
      cause: error,
    });
  }

  const found = new Map();
  const seen = new Set();
  const stack = [data];
  while (stack.length) {
    const value = stack.pop();
    if (!value || typeof value !== "object" || seen.has(value)) {
      continue;
    }
    seen.add(value);
    const candidate = tweetCandidate(value, expectedUsername);
    if (candidate && !found.has(candidate.id)) {
      found.set(candidate.id, candidate);
    }
    if (Array.isArray(value)) {
      stack.push(...value);
    } else {
      stack.push(...Object.values(value));
    }
  }

  const posts = [...found.values()].sort((left, right) => {
    if (left.created_at && right.created_at) {
      return right.created_at.localeCompare(left.created_at);
    }
    try {
      return Number(BigInt(right.id) - BigInt(left.id));
    } catch {
      return right.id.localeCompare(left.id);
    }
  });
  if (!posts.length) {
    throw new Error("X public Embed returned no verified posts for @" + expectedUsername);
  }
  return posts;
}

function timelineUrl(username) {
  const base =
    "https://syndication.twitter.com/srv/timeline-profile/screen-name/" +
    encodeURIComponent(username);
  const params = new URLSearchParams({
    dnt: "true",
    frame: "false",
    hideBorder: "true",
    hideFooter: "true",
    hideHeader: "true",
    hideScrollBar: "true",
    lang: "en",
    showReplies: "true",
    transparent: "true",
  });
  return base + "?" + params.toString();
}

async function fetchOnce(username) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(timelineUrl(username), {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
        "user-agent":
          "Mozilla/5.0 (compatible; tibo-reset-reminder-feed/1.0; +https://github.com/orange90/tibo_reset_reminder_skill)",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(
        "X public Embed returned HTTP " + response.status,
      );
      error.status = response.status;
      throw error;
    }
    return await response.text();
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("X public Embed request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchProfileOnce(username) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      "https://x.com/" + encodeURIComponent(username),
      {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en-US,en;q=0.9",
          "user-agent":
            "Mozilla/5.0 (compatible; tibo-reset-reminder-feed/1.0; +https://github.com/orange90/tibo_reset_reminder_skill)",
        },
        redirect: "follow",
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      const error = new Error(
        "X public profile returned HTTP " + response.status,
      );
      error.status = response.status;
      throw error;
    }
    return await response.text();
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("X public profile request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function enrichLongPosts(posts, username) {
  const candidates = posts.filter((post) => post.text.length >= 250).slice(0, 4);
  if (!candidates.length) {
    return posts;
  }
  const replacements = new Map();
  const results = await Promise.allSettled(
    candidates.map(async (post) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(post.url, {
          headers: {
            accept: "text/html,application/xhtml+xml",
            "accept-language": "en-US,en;q=0.9",
            "user-agent":
              "Mozilla/5.0 (compatible; tibo-reset-reminder-feed/1.0; +https://github.com/orange90/tibo_reset_reminder_skill)",
          },
          redirect: "follow",
          signal: controller.signal,
        });
        if (!response.ok) {
          return;
        }
        const pagePosts = parsePublicProfileHtml(await response.text(), username);
        const expanded = pagePosts.find((item) => item.id === post.id);
        if (expanded && expanded.text.length > post.text.length) {
          replacements.set(post.id, expanded);
        }
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  void results;
  return posts.map((post) => replacements.get(post.id) || post);
}

export async function fetchPublicTimeline(username = TARGET_USERNAME) {
  let profileError;
  try {
    const profileHtml = await fetchProfileOnce(username);
    const profilePosts = await enrichLongPosts(
      parsePublicProfileHtml(profileHtml, username),
      username,
    );
    try {
      const embedHtml = await fetchOnce(username);
      const embedPosts = parseSyndicationHtml(embedHtml, username);
      const merged = new Map(
        [...embedPosts, ...profilePosts].map((post) => [post.id, post]),
      );
      return [...merged.values()].sort((left, right) =>
        String(right.created_at || "").localeCompare(
          String(left.created_at || ""),
        ),
      );
    } catch {
      return profilePosts;
    }
  } catch (error) {
    profileError = error;
  }

  let embedError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const html = await fetchOnce(username);
      return parseSyndicationHtml(html, username);
    } catch (error) {
      embedError = error;
      if (
        attempt === 1 ||
        (error.status && !RETRYABLE_STATUS.has(error.status))
      ) {
        break;
      }
      await sleep(500);
    }
  }
  throw new Error(
    "X public sources failed: " +
      profileError.message +
      "; " +
      embedError.message,
  );
}
