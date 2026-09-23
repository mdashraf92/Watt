import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../middleware/error';
import { validateBody } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/requireRole';
import { query } from '../../db/pool';
import { sendEmail } from '../../integrations/email';
import { env } from '../../config/env';

/**
 * Pre-launch waitlist — the marketing site's only write endpoint.
 *
 * Public and unauthenticated by necessity: it collects a name and one contact
 * from a visitor who has no account yet, which is the whole point of a waitlist.
 * That makes it the most exposed route in the API, so it is deliberately narrow:
 *
 *   - one POST that writes one row, and two authenticated admin reads;
 *   - a strict rate limit per IP, tighter than the auth limiter;
 *   - Zod-validated Omani phone / email, so junk cannot reach the table;
 *   - `on conflict do nothing`, so a visitor who taps twice is not an error and
 *     the endpoint cannot be used to probe who is already signed up (the same
 *     201 comes back either way);
 *   - no data is echoed back — the response body is `{ ok: true }` and nothing
 *     else, so the route can never become a lookup for someone else's number.
 *
 * Table: run sql/backend-waitlist.sql on the production database first. Until
 * api.go-watt.com exists (launch blockers B1/B2), the website's form falls back
 * to a prefilled WhatsApp message, so nothing is lost while this is unreachable.
 */

const router = Router();

// 5 submissions per IP per hour. A real person signs up once; anything above
// this is a script. Deliberately far below the /api/auth limiter.
const waitlistLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Too many sign-ups from this address. Try again later.' } },
});

const bodySchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(80),
  contact: z.enum(['phone', 'email']),
  // Oman mobile numbers are 8 digits beginning 7 or 9, in +968.
  phone: z.string().regex(/^\+968[79]\d{7}$/, 'Invalid Omani phone number').nullable().optional(),
  email: z.string().email('Invalid email address').max(160).nullable().optional(),
  role: z.enum(['driver', 'host', 'both']),
  lang: z.enum(['ar', 'en']).default('ar'),
  source: z.string().trim().max(40).default('website'),
})
  // The chosen contact method must actually be present: without this a
  // submission can be stored that we have no way of answering.
  .refine((v) => (v.contact === 'phone' ? !!v.phone : !!v.email), {
    message: 'The selected contact method is missing',
  });

router.post('/',
  waitlistLimiter,
  validateBody(bodySchema),
  asyncHandler(async (req, res) => {
    const { name, contact, phone, email, role, lang, source } = req.body as z.infer<typeof bodySchema>;

    const { rows } = await query<{ id: string; inserted: boolean }>(
      `insert into public.waitlist (name, contact_method, phone, email, role, lang, source)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict do nothing
       returning id, true as inserted`,
      [name, contact, phone ?? null, email ?? null, role, lang, source],
    );

    const isNew = rows.length > 0;

    // Notify the team, but never let a mail failure fail the visitor's
    // submission — the row is already committed and that is what matters.
    if (isNew && env.SMTP_HOST) {
      const to = env.WAITLIST_NOTIFY_TO || env.SMTP_FROM;
      sendEmail(
        to,
        `GO WATT waitlist — ${role}`,
        `<p><strong>${escapeHtml(name)}</strong> joined the waitlist.</p>
         <ul>
           <li>Role: ${role}</li>
           <li>Contact: ${escapeHtml(phone || email || '')}</li>
           <li>Language: ${lang}</li>
           <li>Source: ${escapeHtml(source)}</li>
         </ul>`,
      ).catch((err) => console.error('[waitlist] notify failed', err));
    }

    // 201 whether or not the row was new. A duplicate is a success from the
    // visitor's side, and distinguishing the two here would leak membership.
    res.status(201).json({ ok: true });
  }),
);

// ── Admin reads ────────────────────────────────────────────────────────────
// Everything past this point requires an admin session.

router.get('/', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const { rows } = await query(
    `select id, name, contact_method, phone, email, role, lang, source, notified_at, created_at
     from public.waitlist
     order by created_at desc
     limit $1`,
    [limit],
  );
  res.json(rows);
}));

router.get('/stats', requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `select count(*)::int as total,
            count(*) filter (where role in ('host','both'))::int as hosts,
            count(*) filter (where role in ('driver','both'))::int as drivers,
            count(*) filter (where created_at > now() - interval '7 days')::int as last_7_days
     from public.waitlist`,
  );
  res.json(rows[0]);
}));

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

export default router;
