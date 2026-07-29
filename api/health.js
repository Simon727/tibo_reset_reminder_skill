import { FEED_KEY, hasRedisConfig } from "../lib/config.js";
import { getJson } from "../lib/redis.js";

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  if (!hasRedisConfig()) {
    res.status(503).json({
      ok: false,
      redis_configured: false,
      error: "redis_not_configured",
    });
    return;
  }
  try {
    const feed = await getJson(FEED_KEY);
    res.status(feed && !feed.stale ? 200 : 503).json({
      ok: Boolean(feed && !feed.stale),
      redis_configured: true,
      initialized: Boolean(feed),
      stale: feed ? Boolean(feed.stale) : null,
      last_success_at: feed ? feed.last_success_at : null,
      last_attempt_at: feed ? feed.last_attempt_at : null,
      post_count: feed && Array.isArray(feed.posts) ? feed.posts.length : 0,
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      redis_configured: true,
      error: "health_check_failed",
      message: error.message,
    });
  }
}
