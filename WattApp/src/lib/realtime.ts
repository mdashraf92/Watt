import { io, Socket } from 'socket.io-client';
import { ENV } from '../config/env';
import { tokenStore } from './tokenStore';

// Live updates from the backend (replaces Supabase Realtime). The backend emits
// a 'change' event { table, event, new } when stations / charger_listings /
// bookings rows change. Screens subscribe to the table(s) they care about.

type ChangeMsg = { table: string; event: string; new: any };
type Handler = (row: any, msg: ChangeMsg) => void;

export type VanLocation = { request_id: string; latitude: number; longitude: number; at: string };
export type JobUpdate   = { request_id: string; status: string };
type JobHandlers = { onLocation?: (l: VanLocation) => void; onUpdate?: (u: JobUpdate) => void };

let socket: Socket | null = null;
const handlers = new Map<string, Set<Handler>>();  // table → handlers

// Mobile-charge jobs do NOT ride the 'change' broadcast — a van's live position
// is one employee's real-time location, so the server only sends it to the two
// people on the job. Rejoining after a reconnect is our responsibility: the
// server's room membership dies with the socket.
const jobRooms = new Map<string, Set<JobHandlers>>();  // request id → handlers

function ensureSocket() {
  if (socket || !ENV.apiUrl) return;
  socket = io(ENV.apiUrl, {
    transports: ['websocket'],
    auth: { token: tokenStore.getAccess() ?? '' },
    reconnection: true,
  });
  socket.on('change', (msg: ChangeMsg) => {
    const set = handlers.get(msg.table);
    if (set) set.forEach(h => h(msg.new, msg));
  });
  socket.on('van_location', (l: VanLocation) => {
    jobRooms.get(l.request_id)?.forEach(h => h.onLocation?.(l));
  });
  socket.on('mobile_job_update', (u: JobUpdate) => {
    jobRooms.get(u.request_id)?.forEach(h => h.onUpdate?.(u));
  });
  socket.on('connect', () => {
    for (const id of jobRooms.keys()) socket?.emit('job:join', id);
  });
}

export const realtime = {
  // Subscribe to changes on a table; returns an unsubscribe function.
  onTable(table: string, handler: Handler): () => void {
    ensureSocket();
    if (!handlers.has(table)) handlers.set(table, new Set());
    handlers.get(table)!.add(handler);
    return () => {
      handlers.get(table)?.delete(handler);
    };
  },

  // Watch one mobile-charge job: the van's position and its status changes.
  // The server checks the caller is the customer or the assigned driver before
  // letting the socket into the room, so a guessed id gets nothing back.
  onJob(requestId: string, h: JobHandlers): () => void {
    ensureSocket();
    if (!jobRooms.has(requestId)) {
      jobRooms.set(requestId, new Set());
      socket?.emit('job:join', requestId);
    }
    jobRooms.get(requestId)!.add(h);
    return () => {
      const set = jobRooms.get(requestId);
      set?.delete(h);
      if (set && set.size === 0) {
        jobRooms.delete(requestId);
        socket?.emit('job:leave', requestId);
      }
    };
  },

  // Re-auth the socket after login/refresh.
  reconnectWithToken() {
    if (socket) { socket.auth = { token: tokenStore.getAccess() ?? '' }; socket.disconnect().connect(); }
    else ensureSocket();
  },

  disconnect() {
    socket?.disconnect();
    socket = null;
    handlers.clear();
    jobRooms.clear();
  },
};
