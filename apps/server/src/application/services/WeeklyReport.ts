import { and, avg, count, desc, eq, gte } from 'drizzle-orm';
import { db } from '../../infrastructure/database/db';
import { testimonials, users } from '../../infrastructure/database/schema';
import type { CloudflareEmailService } from '../../infrastructure/email/CloudflareEmailService';

// Monday summary for every owner who kept "Weekly reports" on. Skipped when nothing happened and nothing is waiting.
export async function sendWeeklyReports(email: CloudflareEmailService) {
  const since = new Date(Date.now() - 7 * 86400000);
  const owners = await db.select().from(users);
  for (const owner of owners) {
    const prefs = (owner.notificationPrefs ?? {}) as { weeklyReport?: boolean };
    if (prefs.weeklyReport === false) continue;
    const mine = eq(testimonials.userId, owner.id);
    const [week] = await db.select({ n: count(), avg: avg(testimonials.rating) }).from(testimonials).where(and(mine, gte(testimonials.createdAt, since)));
    const [pending] = await db.select({ n: count() }).from(testimonials).where(and(mine, eq(testimonials.status, 'pending')));
    const [approved] = await db.select({ n: count() }).from(testimonials).where(and(mine, eq(testimonials.status, 'approved')));
    const newCount = Number(week?.n ?? 0);
    const pendingCount = Number(pending?.n ?? 0);
    if (newCount === 0 && pendingCount === 0) continue;
    const latest = await db.select({ authorName: testimonials.authorName, rating: testimonials.rating, content: testimonials.content })
      .from(testimonials).where(and(mine, gte(testimonials.createdAt, since))).orderBy(desc(testimonials.createdAt)).limit(5);
    await email.sendWeeklyReport({
      ownerEmail: owner.email,
      newCount,
      pendingCount,
      averageRating: week?.avg ? Number(week.avg) : null,
      approvedTotal: Number(approved?.n ?? 0),
      latest: latest.map(r => ({ authorName: r.authorName, rating: r.rating ?? undefined, content: r.content })),
    });
  }
}
