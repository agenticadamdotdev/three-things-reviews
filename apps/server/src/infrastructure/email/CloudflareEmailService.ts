import type { IEmailService, SendEmailOptions, NewReviewNotificationData } from '../../domain/services/IEmailService';

// Cloudflare Email Sending through the Workers `send_email` binding. The binding only allows EMAIL_FROM as the sender.
interface SendEmailBinding {
  send(message: { to: string; from: string | { email: string; name: string }; subject: string; html: string; text: string }): Promise<{ messageId: string }>;
}

export interface WeeklyReportData {
  ownerEmail: string;
  newCount: number;
  pendingCount: number;
  averageRating: number | null;
  approvedTotal: number;
  latest: { authorName: string; rating?: number; content: string }[];
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const stars = (n?: number) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '');

function layout(title: string, bodyHtml: string, cta: { href: string; label: string }) {
  return `<!doctype html><html lang="en"><body style="margin:0;background:#f4f4f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#182b2b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4df;border-radius:12px;padding:28px">
<tr><td style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b7472;padding-bottom:6px">3 Things reviews</td></tr>
<tr><td style="font-size:22px;font-weight:700;padding-bottom:16px">${esc(title)}</td></tr>
<tr><td style="font-size:15px;line-height:1.55">${bodyHtml}</td></tr>
<tr><td style="padding-top:22px"><a href="${cta.href}" style="display:inline-block;background:#182b2b;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:8px">${esc(cta.label)}</a></td></tr>
</table></td></tr></table></body></html>`;
}

export class CloudflareEmailService implements IEmailService {
  constructor(private readonly binding: SendEmailBinding, private readonly from: string, private readonly adminUrl: string) {}

  private async deliver(to: string, subject: string, html: string, text: string) {
    try {
      await this.binding.send({ to, from: { email: this.from, name: '3 Things Reviews' }, subject, html, text });
    } catch (err) {
      const e = err as { code?: string; message?: string };
      throw new Error(`Email to ${to} failed: ${e.code ?? ''} ${e.message ?? ''}`.trim());
    }
  }

  async send(options: SendEmailOptions): Promise<void> {
    await this.deliver(options.to, options.subject, options.html, options.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  }

  async sendNewReviewNotification(data: NewReviewNotificationData): Promise<void> {
    const link = `${this.adminUrl}/forms/${data.formId}`;
    const rating = data.rating ? `${stars(data.rating)} (${data.rating}/5)` : 'No rating';
    const html = layout(`New review from ${data.authorName}`, `
      <p style="margin:0 0 6px;color:#c8962e;font-size:18px">${esc(stars(data.rating))}</p>
      <blockquote style="margin:0 0 14px;padding:12px 16px;background:#f7f7f4;border-left:3px solid #79af97;border-radius:6px">${esc(data.content)}</blockquote>
      <p style="margin:0;color:#6b7472">Verified buyer · waiting for your approval. It won't show on the site until you approve it.</p>`,
      { href: link, label: 'Review and approve' });
    const text = `New review from ${data.authorName}\n${rating}\n\n"${data.content}"\n\nVerified buyer. It won't show on the site until you approve it.\nReview and approve: ${link}\n`;
    await this.deliver(data.ownerEmail, `New ${data.rating ? `${data.rating}★ ` : ''}review from ${data.authorName}`, html, text);
  }

  async sendWeeklyReport(d: WeeklyReportData): Promise<void> {
    const avg = d.averageRating ? d.averageRating.toFixed(1) : 'n/a';
    const latestHtml = d.latest.map(r => `<li style="margin:0 0 8px"><strong>${esc(r.authorName)}</strong> <span style="color:#c8962e">${esc(stars(r.rating))}</span><br><span style="color:#43504e">${esc(r.content.length > 160 ? r.content.slice(0, 160) + '…' : r.content)}</span></li>`).join('');
    const html = layout('Your week in reviews', `
      <p style="margin:0 0 14px"><strong>${d.newCount}</strong> new review${d.newCount === 1 ? '' : 's'} this week · average <strong>${avg}</strong> · <strong>${d.pendingCount}</strong> waiting for approval · <strong>${d.approvedTotal}</strong> live on the site.</p>
      ${latestHtml ? `<ul style="margin:0;padding-left:18px">${latestHtml}</ul>` : ''}`,
      { href: this.adminUrl, label: d.pendingCount ? `Approve ${d.pendingCount} review${d.pendingCount === 1 ? '' : 's'}` : 'Open dashboard' });
    const text = `Your week in reviews\n${d.newCount} new this week, average ${avg}, ${d.pendingCount} waiting for approval, ${d.approvedTotal} live.\n\n` +
      d.latest.map(r => `- ${r.authorName} ${stars(r.rating)}: ${r.content}`).join('\n') + `\n\nDashboard: ${this.adminUrl}\n`;
    await this.deliver(d.ownerEmail, `Weekly reviews: ${d.newCount} new, ${d.pendingCount} to approve`, html, text);
  }
}
