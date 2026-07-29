import { redisConfig } from "./config.js";

const REQUEST_TIMEOUT_MS = 8_000;

async function redisCommand(command) {
  const { url, token } = redisConfig();
  if (!url || !token) {
    throw new Error("Upstash Redis is not configured");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
      },
      body: JSON.stringify(command),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      throw new Error(
        "Upstash Redis command failed: " +
          (payload.error || "HTTP " + response.status),
      );
    }
    return payload.result;
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("Upstash Redis request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function getJson(key) {
  const value = await redisCommand(["GET", key]);
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "object") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error("Cached feed is not valid JSON", { cause: error });
  }
}

export async function setJson(key, value) {
  await redisCommand(["SET", key, JSON.stringify(value)]);
}

export async function acquireLock(key, value, ttlSeconds = 120) {
  const result = await redisCommand([
    "SET",
    key,
    value,
    "NX",
    "EX",
    String(ttlSeconds),
  ]);
  return result === "OK";
}

export async function releaseLock(key, value) {
  const script =
    "if redis.call('get', KEYS[1]) == ARGV[1] then " +
    "return redis.call('del', KEYS[1]) else return 0 end";
  await redisCommand(["EVAL", script, "1", key, value]);
}
