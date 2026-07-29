import { pool } from '../db/pool';
import { sendPush } from './push';

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
};

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

  return { created: rows.length, pushed };
}
