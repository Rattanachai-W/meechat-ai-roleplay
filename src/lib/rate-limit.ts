import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/api/errors";

/**
 * Upstash sliding-window rate limit — ถ้ายังไม่ตั้งค่า UPSTASH env
 * จะ skip (allow) พร้อม warn ครั้งเดียว เพื่อไม่บล็อก dev
 */
let warned = false;
let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    if (!warned) {
      warned = true;
      console.warn("[rate-limit] UPSTASH env not set — rate limiting disabled");
    }
    return null;
  }
  redis ??= new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return redis;
}

const LIMITS = {
  chat: { limit: 20, window: "1 m" },
  regenerate: { limit: 10, window: "1 m" },
  "character-create": { limit: 10, window: "1 h" },
  "daily-claim": { limit: 6, window: "1 h" },
  "creator-profile": { limit: 10, window: "1 h" },
  "quest-write": { limit: 20, window: "1 h" },
  // เปิด checkout / ยืนยันการชำระเงิน — เผื่อ retry แต่กันยิงรัว
  purchase: { limit: 10, window: "1 h" },
} as const;

export type RateLimitName = keyof typeof LIMITS;
type WindowSpec = `${number} ${"s" | "m" | "h"}`;

const limiters = new Map<RateLimitName, Ratelimit>();

function getLimiter(name: RateLimitName): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  let limiter = limiters.get(name);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(LIMITS[name].limit, LIMITS[name].window as WindowSpec),
      prefix: `meechat:${name}`,
    });
    limiters.set(name, limiter);
  }
  return limiter;
}

/** throw RATE_LIMITED ถ้าเกินโควตา; identifier เช่น userId */
export async function enforceRateLimit(
  name: RateLimitName,
  identifier: string
): Promise<void> {
  const limiter = getLimiter(name);
  if (!limiter) return;

  const { success } = await limiter.limit(identifier);
  if (!success) throw new ApiError("RATE_LIMITED");
}
