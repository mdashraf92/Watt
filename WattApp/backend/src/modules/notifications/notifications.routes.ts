import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { pool } from '../../db/pool';

// The in-app notification inbox behind the map bell.
//
// Every query is scoped by req.user.id, so role filtering is implicit: a user
// only ever receives the notifications that were addressed to them. Hosts get
// host events, admins get admin events, because that is who notify() targeted.
const router = Router();
router.use(requireAuth);

// GET /api/notifications?limit=&before=  — newest first, cursor-paginated.
router.get('/', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  // Keyset pagination on created_at: stable under inserts, unlike offset.
  const before = typeof req.query.before === 'string' ? req.query.before : null;

  const { rows } = await pool.query(
    `select id, category, kind, title, body, data, read_at, created_at
       from public.notifications
      where user_id = $1
        and ($2::timestamptz is null or created_at < $2::timestamptz)
      order by created_at desc
      limit $3`,
    [req.user!.id, before, limit],
  );

  res.json({
    success: true,
    notifications: rows,
    // Null once the last page is reached, so the app knows to stop.
    next_before: rows.length === limit ? rows[rows.length - 1].created_at : null,
  });
}));

// GET /api/notifications/unread-count — drives the bell badge.
router.get('/unread-count', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `select count(*)::int as count from public.notifications
      where user_id = $1 and read_at is null`,
    [req.user!.id],
  );
  res.json({ success: true, count: rows[0]?.count ?? 0 });
}));

// POST /api/notifications/read  { ids: [...] } — mark specific rows read.
router.post('/read',
  validateBody(z.object({ ids: z.array(z.string().uuid()).min(1).max(200) })),
  asyncHandler(async (req, res) => {
    // The user_id predicate is the authorization check: ids belonging to
    // someone else simply match no rows.
    const { rowCount } = await pool.query(
      `update public.notifications set read_at = now()
        where user_id = $1 and id = any($2::uuid[]) and read_at is null`,
      [req.user!.id, req.body.ids],
    );
    res.json({ success: true, updated: rowCount ?? 0 });
  }),
);

// POST /api/notifications/read-all
router.post('/read-all', asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query(
    `update public.notifications set read_at = now()
      where user_id = $1 and read_at is null`,
    [req.user!.id],
  );
  res.json({ success: true, updated: rowCount ?? 0 });
}));

export default router;
