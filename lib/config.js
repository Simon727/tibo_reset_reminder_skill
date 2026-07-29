export const TARGET_USERNAME = "thsottiaux";
export const FEED_KEY = "tibo-reset-reminder:feed:v1";
export const REFRESH_LOCK_KEY = "tibo-reset-reminder:refresh-lock:v1";
export const HISTORY_DAYS = 30;
export const MAX_STORED_POSTS = 200;

export function redisConfig() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    "";
  return { url: url.replace(/\/+$/, ""), token };
}

export function hasRedisConfig() {
  const { url, token } = redisConfig();
  return Boolean(url && token);
}
