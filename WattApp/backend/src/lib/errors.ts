// Typed application errors → clean HTTP responses via the error middleware.
export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest   = (msg = 'Bad request')   => new AppError(400, 'bad_request', msg);
export const unauthorized = (msg = 'Unauthorized')  => new AppError(401, 'unauthorized', msg);
export const forbidden    = (msg = 'Forbidden')     => new AppError(403, 'forbidden', msg);
export const notFound     = (msg = 'Not found')     => new AppError(404, 'not_found', msg);
export const conflict     = (msg = 'Conflict')      => new AppError(409, 'conflict', msg);

// Map a raised Postgres exception (e.g. from our SQL functions) to a clean error.
export function fromPgError(e: any): AppError {
  const msg: string = e?.message ?? 'Database error';
  // Our functions raise 'INSUFFICIENT_BALANCE|required=..|shortfall=..'
  if (msg.includes('INSUFFICIENT_BALANCE')) return new AppError(402, 'insufficient_balance', msg);
  if (/Not authenticated/i.test(msg))       return unauthorized();
  if (/Permission denied|admin only/i.test(msg)) return forbidden(msg);
  if (/not found/i.test(msg))               return notFound(msg);

  // Mobile charging raises its own tagged errors. Without these they would all
  // surface as 500s, and the app would show "server error" for things that are
  // really the user being told no.
  if (msg.startsWith('FORBIDDEN|'))         return forbidden(msg);
  if (msg.startsWith('ALREADY_ACTIVE|'))    return conflict(msg);
  if (msg.startsWith('TOO_LATE|'))          return conflict(msg);
  if (msg.startsWith('BAD_TRANSITION|'))    return conflict(msg);
  if (msg.startsWith('DISABLED|'))          return new AppError(503, 'unavailable', msg);
  if (/^(OUT_OF_AREA|OUT_OF_RANGE|BAD_KWH|BAD_RATING|NOT_COMPLETED|NO_VAN|INVALID_STATUS|BUSY)\|/.test(msg))
    return badRequest(msg);

  if (e?.code === '23505')                  return conflict('Already exists');       // unique_violation
  if (e?.code === '23P01')                  return conflict('Time slot just taken'); // exclusion (booking overlap)
  if (e?.code === '23514' || e?.code === '23503' || e?.code === '22P02')
    return badRequest(msg);
  return new AppError(500, 'server_error', msg);
}
