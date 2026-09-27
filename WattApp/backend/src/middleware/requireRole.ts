import { Request, Response, NextFunction } from 'express';
import { forbidden, unauthorized } from '../lib/errors';
import { pool } from '../db/pool';

// Role guards. Admin endpoints accept admin OR superadmin (mirrors is_admin()).
export function requireRole(...roles: string[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    try {
      // JWT role claims can outlive a demotion or suspended account.
      const { rows } = await pool.query('select role,is_active from profiles where id=$1', [req.user.id]);
      if (!rows[0]?.is_active || !roles.includes(rows[0].role)) return next(forbidden());
      req.user.role = rows[0].role;
      next();
    } catch (error) { next(error); }
  };
}

export const requireAdmin      = requireRole('admin', 'superadmin');
export const requireSuperadmin = requireRole('superadmin');
