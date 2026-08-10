import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/requireRole';
import { validateBody } from '../../middleware/validate';
import { query } from '../../db/pool';
import { notify } from '../../integrations/notify';

/**
 * "Report a problem" — from the 4 Aug 2026 meeting: users need a way to raise
 * any kind of issue (charger fault, payment, safety, damage, other), an admin
 * inbox to see them, and a way to respond/close. No money moves through this
 * module, so plain parameterized queries are enough — ownership is enforced
 * in the WHERE clause, admin routes are gated by requireAdmin.
 *
 * Table: run sql/backend-support-reports.sql first.
 */
const router = Router();
router.use(requireAuth);

const CATEGORIES = ['charger_fault', 'payment', 'safety', 'damage', 'other'] as const;

const createSchema = z.object({
  category: z.enum(CATEGORIES),
  description: z.string().trim().min(1).max(2000),
  photo_base64: z.string().max(3_000_000).nullable().optional(),
  booking_id: z.string().uuid().nullable().optional(),
  session_id: z.string().uuid().nullable().optional(),
});

// POST /api/reports — create a report; notifies every admin/superadmin.
router.post('/',
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const { category, description, photo_base64, booking_id, session_id } = req.body as z.infer<typeof createSchema>;
    const { rows } = await query(
      `insert into public.support_reports (user_id, category, description, photo_base64, booking_id, session_id)
       values ($1,$2,$3,$4,$5,$6) returning *`,
      [req.user!.id, category, description, photo_base64 ?? null, booking_id ?? null, session_id ?? null],
    );
    const report = rows[0];

    const { rows: admins } = await query(`select id from public.profiles where role in ('admin','superadmin')`);
    if (admins.length) {
      notify({
        userIds: admins.map(a => a.id),
        category: 'booking',
        kind: 'report_created',
        title: 'New issue reported',
        body: `A user reported a ${category.replace('_', ' ')} issue.`,
        data: { report_id: report.id },
      }).catch(() => {});
    }

    res.status(201).json(report);
  }),
);

// GET /api/reports — the caller's own reports, newest first.
router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `select * from public.support_reports where user_id = $1 order by created_at desc`,
    [req.user!.id],
  );
  res.json(rows);
}));

// ── Admin inbox ──────────────────────────────────────────────────────────

// GET /api/reports/admin?status=open — all reports, optionally filtered.
router.get('/admin', requireAdmin, asyncHandler(async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : null;
  const { rows } = await query(
    `select r.*, json_build_object('full_name', p.full_name, 'phone', p.phone) as reporter
     from public.support_reports r
     join public.profiles p on p.id = r.user_id
     where $1::text is null or r.status = $1
     order by r.created_at desc`,
    [status],
  );
  res.json(rows);
}));

// POST /api/reports/admin/:id/respond — reply, moves to in_review.
router.post('/admin/:id/respond',
  requireAdmin,
  validateBody(z.object({ message: z.string().trim().min(1).max(2000) })),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `update public.support_reports
         set admin_response = $2, status = 'in_review'
       where id = $1
       returning *`,
      [req.params.id, req.body.message],
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'not_found', message: 'Report not found' } });

    notify({
      userIds: [rows[0].user_id],
      category: 'booking',
      kind: 'report_responded',
      title: 'Update on your report',
      body: req.body.message,
      data: { report_id: rows[0].id },
    }).catch(() => {});

    res.json(rows[0]);
  }),
);

// POST /api/reports/admin/:id/close — mark resolved.
router.post('/admin/:id/close', requireAdmin, asyncHandler(async (req, res) => {
  const { rows } = await query(
    `update public.support_reports
       set status = 'resolved', resolved_by = $2, resolved_at = now()
     where id = $1
     returning *`,
    [req.params.id, req.user!.id],
  );
  if (!rows[0]) return res.status(404).json({ error: { code: 'not_found', message: 'Report not found' } });

  notify({
    userIds: [rows[0].user_id],
    category: 'booking',
    kind: 'report_resolved',
    title: 'Your report was resolved',
    body: 'Thanks for letting us know — this issue has been marked resolved.',
    data: { report_id: rows[0].id },
  }).catch(() => {});

  res.json(rows[0]);
}));

export default router;
