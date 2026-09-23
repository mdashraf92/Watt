import { Server as HttpServer } from 'http';
import { Server as IOServer } from 'socket.io';
import { Client } from 'pg';
import { env } from '../config/env';
import { pool } from '../db/pool';
import { verifyAccessToken } from '../lib/jwt';

// Replaces Supabase Realtime. A dedicated pg LISTENer receives row changes
// (see sql/backend-realtime.sql) and broadcasts them to authenticated clients.
// The app subscribes and updates the relevant screen (map, charger, booking).
//
// TWO DELIVERY MODES, deliberately kept apart:
//
//   'change'  — the LISTEN/NOTIFY firehose, broadcast to everyone. Fine for
//               stations, listings and bookings: public or already-scoped data.
//   rooms     — targeted. `user:<id>` for one person, `job:<id>` for the two
//               people on a mobile-charge job. Mobile charging rides on these
//               because a van's live coordinates are a named employee's
//               real-time location; broadcasting that to every logged-in user
//               would be indefensible. This is also why service_vans and
//               mobile_charge_requests carry no notify_row_change trigger.

let ioRef: IOServer | null = null;

export function attachRealtime(server: HttpServer) {
  const io = new IOServer(server, {
    cors: { origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',') },
  });
  ioRef = io;

  // Authenticate each socket with the same access token as the REST API.
  io.use((socket, next) => {
    const token = (socket.handshake.auth?.token as string) ?? '';
    try { socket.data.user = verifyAccessToken(token); next(); }
    catch { next(new Error('unauthorized')); }
  });

  io.on('connection', (socket) => {
    const uid = socket.data.user?.sub as string | undefined;
    if (!uid) return;

    // Everyone lands in their own room, so the server can reach one user
    // without knowing their socket id.
    socket.join(`user:${uid}`);

    // Joining a job room is a permission decision, not a client one: the server
    // checks the caller is actually the customer or the assigned driver. Without
    // this check any authenticated user could subscribe to any job's GPS by
    // guessing an id.
    socket.on('job:join', async (requestId: unknown, ack?: (ok: boolean) => void) => {
      if (typeof requestId !== 'string') return ack?.(false);
      try {
        const { rows } = await pool.query(
          `select 1 from public.mobile_charge_requests
            where id = $1 and (user_id = $2 or operator_id = $2)`,
          [requestId, uid],
        );
        if (!rows.length) return ack?.(false);
        socket.join(`job:${requestId}`);
        ack?.(true);
      } catch {
        ack?.(false);
      }
    });

    socket.on('job:leave', (requestId: unknown) => {
      if (typeof requestId === 'string') socket.leave(`job:${requestId}`);
    });
  });

  // Dedicated LISTEN client (kept open, auto-reconnect on error).
  const listen = () => {
    const client = new Client({ connectionString: env.DATABASE_URL });
    client.connect()
      .then(() => client.query('LISTEN row_change'))
      .catch((e) => { console.error('[realtime] listen connect failed', e.message); setTimeout(listen, 5000); });

    client.on('notification', (msg) => {
      if (!msg.payload) return;
      try { io.emit('change', JSON.parse(msg.payload)); } catch { /* ignore */ }
    });
    client.on('error', (e) => {
      console.error('[realtime] listener error', e.message);
      try { client.end(); } catch { /* noop */ }
      setTimeout(listen, 5000);
    });
  };
  listen();

  return io;
}

/** Send to one user's own room (all their devices). No-op before startup. */
export function emitToUser(userId: string, event: string, payload: any) {
  ioRef?.to(`user:${userId}`).emit(event, payload);
}

/** Send to everyone watching one mobile-charge job — customer and driver only. */
export function emitToJob(requestId: string, event: string, payload: any) {
  ioRef?.to(`job:${requestId}`).emit(event, payload);
}
