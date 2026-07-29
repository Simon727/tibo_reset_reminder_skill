import { FEED_KEY } from "../lib/config.js";
import { getJson } from "../lib/redis.js";

function send(res, status, payload) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader(
    "cache-control",
    "public, s-maxage=60, stale-while-revalidate=600",
  );
  res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "GET, OPTIONS");
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.setHeader("allow", "GET, OPTIONS");
    send(res, 405, { error: "method_not_allowed" });
    return;
  }

  try {
    const feed = await getJson(FEED_KEY);
    if (!feed) {
      send(res, 503, {
        error: "feed_not_initialized",
        message: "The first refresh has not completed yet.",
      });
      return;
    }
    send(res, 200, feed);
  } catch (error) {
    send(res, 503, {
      error: "feed_unavailable",
      message: error.message,
    });
  }
}
