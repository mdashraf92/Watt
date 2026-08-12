import { pool } from '../db/pool';
import { sendPush } from './push';
import { sendEmail } from './email';

// The single entry point for telling a user something happened.
//
// Writes the durable inbox row FIRST, then fires the transient push. Order
// matters: a push that arrives with no matching inbox row is a dead end for the
// user, whereas an inbox row whose push failed still shows up under the bell.
//
// Call this instead of sendPush() directly — sendPush alone leaves no history.

export type Category = 'booking' | 'charging' | 'promo';

export type NotifyInput = {
  userIds: string[];
  category?: Category;
  kind: string;                    // e.g. 'booking_confirmed', 'charge_end_soon'
  title: string;
  body: string;
  data?: Record<string, any>;
  /**
   * Set for anything a polling job can emit more than once. Must be unique per
   * logical event — e.g. `charge_end_soon:<session_id>`. A second attempt with
   * the same key is silently dropped (both the row and the push), so a cron job
   * that re-sees the same booking cannot spam the user.
   *
   * Only usable with a single userId, since the uniqueness is on the key alone.
   */
  dedupeKey?: string;
  /**
   * Also email the same title/body, for events worth a permanent record even
   * if the recipient never opens the app (an investor decision, a report
   * response) — as opposed to routine/frequent events (booking reminders,
   * dispatch updates) where email would just be spam. Silently skipped for
   * any recipient with no email on file (phone-only accounts) — this is a
   * bonus channel, never a requirement.
   */
  email?: boolean;
};

function notificationEmailHtml(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F6F8F7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#16241D">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:480px;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E4E9E6">
        <tr><td style="background:#214A38;padding:28px 28px 24px">
          <span style="color:#FFFFFF;font-size:22px;font-weight:800;letter-spacing:3px">GO WATT</span>
        </td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 8px;font-size:20px;color:#16241D">${title}</h1>
          <p style="margin:0;font-size:14px;line-height:22px;color:#5A6B62">${body}</p>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

export async function notify(input: NotifyInput): Promise<{ created: number; pushed: number }> {
  const { userIds, kind, title, body } = input;
  const category = input.category ?? 'booking';
  const data = input.data ?? {};
  if (!userIds.length) return { created: 0, pushed: 0 };

  if (input.dedupeKey && userIds.length > 1) {
    throw new Error('notify(): dedupeKey cannot be used with multiple userIds');
  }

  // `on conflict do nothing` against the partial unique index makes the whole
  // call idempotent — the returning clause comes back empty on a duplicate.
  const { rows } = await pool.query(
    `insert into public.notifications (user_id, category, kind, title, body, data, dedupe_key)
     select unnest($1::uuid[]), $2, $3, $4, $5, $6::jsonb, $7
     on conflict (dedupe_key) where dedupe_key is not null do nothing
     returning user_id`,
    [userIds, category, kind, title, body, JSON.stringify(data), input.dedupeKey ?? null],
  );

  // Nothing inserted → this event was already delivered. Skip the push too.
  if (!rows.length) return { created: 0, pushed: 0 };

  const pushed = await sendPush(
    rows.map(r => r.user_id),
    category,
    title,
    body,
    { ...data, kind },
  ).catch(() => 0);

  if (input.email) {
    const { rows: withEmail } = await pool.query(
      `select id, email from auth.users where id = any($1::uuid[]) and email is not null`,
      [rows.map(r => r.user_id)],
    );
    for (const u of withEmail) {
      sendEmail(u.email, title, notificationEmailHtml(title, body))
        // eslint-disable-next-line no-console
        .catch((e) => console.error('[notify] email send failed:', e?.message ?? e));
    }
  }

  return { created: rows.length, pushed };
}
