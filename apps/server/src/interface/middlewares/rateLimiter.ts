import type { Context, Next } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '@/infrastructure/database/db';
import { rateLimits } from '@/infrastructure/database/schema';

// D1 has no interactive transactions, so the window is kept in a single atomic upsert:
// a fresh or expired row resets to 1, otherwise the count goes up by one.
export const rateLimiter = (options: { limit: number; windowMs: number }) => {
  return async (c: Context, next: Next) => {
    const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const now = new Date();
    const key = `rl:${ip}`;
    const windowEnd = new Date(now.getTime() + options.windowMs);

    try {
      const [row] = await db.insert(rateLimits)
        .values({ key, count: 1, resetAt: windowEnd })
        .onConflictDoUpdate({
          target: rateLimits.key,
          set: {
            count: sql`case when ${rateLimits.resetAt} < ${now.getTime()} then 1 else ${rateLimits.count} + 1 end`,
            resetAt: sql`case when ${rateLimits.resetAt} < ${now.getTime()} then ${windowEnd.getTime()} else ${rateLimits.resetAt} end`,
          },
        })
        .returning({ count: rateLimits.count });

      if ((row?.count ?? 1) > options.limit) {
        return c.json({ error: 'Too many requests, please try again later.' }, 429);
      }
    } catch (error) {
      console.error('Rate limiter database error:', error);
    }

    await next();
  };
};
