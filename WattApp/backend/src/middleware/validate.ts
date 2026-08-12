import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { badRequest } from '../lib/errors';

// Validate req.body / params / query against a zod schema; replaces the value
// with the parsed (typed) result.
// A field with multiple chained checks (e.g. password's several .regex()
// calls) can fail more than one at once with the identical message — dedupe
// so the caller doesn't see the same sentence repeated.
function formatIssues(issues: { message: string }[]): string {
  return [...new Set(issues.map(i => i.message))].join(', ');
}

export const validateBody = (schema: ZodSchema) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const r = schema.safeParse(req.body);
    if (!r.success) return next(badRequest(formatIssues(r.error.issues)));
    req.body = r.data;
    next();
  };

export const validateQuery = (schema: ZodSchema) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const r = schema.safeParse(req.query);
    if (!r.success) return next(badRequest(formatIssues(r.error.issues)));
    (req as any).validatedQuery = r.data;
    next();
  };
