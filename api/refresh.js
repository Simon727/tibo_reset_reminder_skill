import {
  FEED_KEY,
  REFRESH_LOCK_KEY,
  TARGET_USERNAME,
  hasRedisConfig,
} from "../lib/config.js";
import { markFeedFailure, mergeFeed } from "../lib/feed.js";
import {
  acquireLock,
  getJson,
  releaseLock,
  setJson,
} from "../lib/redis.js";
import { fetchPublicTimeline } from "../lib/syndication.js";

function authorized(req) {
  const secret = process.env.REFRESH_SECRET || "";
  const supplied = String(req.headers.authorization || "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (!secret || secret.length !== supplied.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < secret.length; index += 1) {
    difference |= secret.charCodeAt(index) ^ supplied.charCodeAt(index);
  }
  return difference === 0;
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  if (!authorized(req)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  if (!hasRedisConfig()) {
    res.status(503).json({ error: "redis_not_configured" });
    return;
  }

  const lockValue = crypto.randomUUID();
  let locked = false;
  try {
    locked = await acquireLock(REFRESH_LOCK_KEY, lockValue);
    if (!locked) {
      res.status(409).json({ error: "refresh_already_running" });
      return;
    }

    const previous = await getJson(FEED_KEY);
    try {
      const posts = await fetchPublicTimeline(TARGET_USERNAME);
      const result = mergeFeed(previous, posts);
      await setJson(FEED_KEY, result.feed);
      res.status(200).json({
        ok: true,
        fetched: posts.length,
        added: result.added,
        updated: result.updated,
        total: result.feed.posts.length,
        last_success_at: result.feed.last_success_at,
      });
    } catch (error) {
      const failedFeed = markFeedFailure(previous, error);
      if (failedFeed) {
        await setJson(FEED_KEY, failedFeed);
      }
      res.status(502).json({
        ok: false,
        error: "x_fetch_failed",
        message: error.message,
        stale_cache_preserved: Boolean(failedFeed),
      });
    }
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: "refresh_failed",
      message: error.message,
    });
  } finally {
    if (locked) {
      await releaseLock(REFRESH_LOCK_KEY, lockValue).catch(() => {});
    }
  }
}
