import { createHash } from 'node:crypto';

const memoryWindows = new Map();

function redisEnvironment() {
  return {
    baseUrl: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  };
}

export function rateLimitMode() {
  const { baseUrl, token } = redisEnvironment();
  return baseUrl && token
    ? 'distributed'
    : 'memory-fallback';
}

export function requestFingerprint(request, scope = 'public') {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const address = forwarded || request.socket?.remoteAddress || 'unknown';
  return createHash('sha256').update(`${scope}:${address}`).digest('hex').slice(0, 32);
}

function enforceMemoryLimit({ key, limit, windowSeconds }) {
  const now = Date.now();
  const existing = memoryWindows.get(key);
  const record = !existing || existing.expiresAt <= now
    ? { count: 0, expiresAt: now + windowSeconds * 1000 }
    : existing;
  record.count += 1;
  memoryWindows.set(key, record);
  if (memoryWindows.size > 5000) {
    for (const [storedKey, value] of memoryWindows) {
      if (value.expiresAt <= now) memoryWindows.delete(storedKey);
    }
  }
  return record.count;
}

export async function enforceRateLimit({ key, limit, windowSeconds, message = 'Too many requests. Please try again shortly.' }) {
  const { baseUrl, token } = redisEnvironment();
  let count;
  if (baseUrl && token) {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const increment = await fetch(`${baseUrl}/pipeline`, { method: 'POST', headers, body: JSON.stringify([['INCR', key], ['EXPIRE', key, String(windowSeconds), 'NX']]) });
    if (!increment.ok) throw new Error('The distributed rate-limit service is unavailable.');
    const results = await increment.json();
    count = Number(results?.[0]?.result || 0);
  } else {
    count = enforceMemoryLimit({ key, limit, windowSeconds });
  }
  if (count > limit) {
    const error = new Error(message);
    error.statusCode = 429;
    throw error;
  }
  return { count, remaining: Math.max(0, limit - count), mode: rateLimitMode() };
}
