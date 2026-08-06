import { ENV } from '../config/env';
import { tokenStore } from './tokenStore';
import type {
  MobileChargeConfig, MobileChargeRequest, OperatorJob, SavedTrip, ServiceVan, TripPlan,
} from '../types';

// ── GO WATT API client (replaces supabase-js) ───────────────────────────────
// Talks to the custom backend. Handles JWT access/refresh tokens, transparent
// token refresh on 401, and clean typed errors.

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE = () => ENV.apiUrl; // e.g. https://api.gowatt.om

export type SavedCard = {
  card_token: string;
  brand: string | null;
  last4: string | null;
  expiry: string | null;
  is_default: boolean;
};
export type CardChargeResult =
  | { status: 'paid'; balance: number; reference: string }
  | { status: 'action_required'; reference: string; redirect_url: string | null };
export type PaymentMethods = {
  method: 'wallet' | 'card';
  cards: SavedCard[];
  available: boolean;   // false when the gateway isn't configured on the server
};

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
interface Opts { auth?: boolean; body?: any; query?: Record<string, any>; }

// Listeners notified when the session is lost (refresh failed) → AuthContext logs out.
let onSessionLost: (() => void) | null = null;
export function setOnSessionLost(fn: () => void) { onSessionLost = fn; }

let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const rt = tokenStore.getRefresh();
  if (!rt) return false;
  try {
    const res = await fetch(`${BASE()}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    await tokenStore.set(data.access_token, data.refresh_token);
    return true;
  } catch { return false; }
}

async function request<T = any>(method: Method, path: string, opts: Opts = {}): Promise<T> {
  if (!BASE()) throw new ApiError(0, 'no_api_url', 'API URL not configured (EXPO_PUBLIC_API_URL)');

  const qs = opts.query
    ? '?' + new URLSearchParams(
        Object.entries(opts.query).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]),
      ).toString()
    : '';

  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    const token = tokenStore.getAccess();
    if (opts.auth !== false && token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${BASE()}${path}${qs}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  };

  let res = await send();

  // Transparent refresh on 401 (once).
  if (res.status === 401 && opts.auth !== false && tokenStore.getRefresh()) {
    refreshing = refreshing ?? doRefresh();
    const ok = await refreshing;
    refreshing = null;
    if (ok) {
      res = await send();
    } else {
      await tokenStore.clear();
      onSessionLost?.();
      throw new ApiError(401, 'unauthorized', 'Session expired');
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiError(res.status, err.code ?? 'error', err.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

function safeJson(s: string): any { try { return JSON.parse(s); } catch { return null; } }

// ── Domain methods ──────────────────────────────────────────────────────────
export const api = {
  request,

  auth: {
    register: (email: string, password: string, full_name: string) =>
      request('POST', '/api/auth/register', { auth: false, body: { email, password, full_name } }),
    login: (email: string, password: string) =>
      request('POST', '/api/auth/login', { auth: false, body: { email, password } }),
    logout: (refresh_token?: string) =>
      request('POST', '/api/auth/logout', { auth: false, body: { refresh_token } }),
    forgotPassword: (email: string) =>
      request('POST', '/api/auth/forgot-password', { auth: false, body: { email } }),
    resetPassword: (token: string, new_password: string) =>
      request('POST', '/api/auth/reset-password', { auth: false, body: { token, new_password } }),
    changePassword: (current_password: string, new_password: string) =>
      request('POST', '/api/auth/change-password', { body: { current_password, new_password } }),
    checkEmail: (email: string) =>
      request<{ exists: boolean }>('POST', '/api/auth/check-email', { auth: false, body: { email } }),
    phoneStart: (phone: string) =>
      request('POST', '/api/auth/phone/start', { auth: false, body: { phone } }),
    phoneVerify: (phone: string, code: string) =>
      request('POST', '/api/auth/phone/verify', { auth: false, body: { phone, code } }),
  },

  profile: {
    me:     () => request('GET', '/api/profile'),
    update: (patch: Record<string, any>) => request('PATCH', '/api/profile', { body: patch }),
    delete: () => request('DELETE', '/api/profile'),
  },

  stations: {
    list:         () => request('GET', '/api/stations'),
    get:          (id: string) => request('GET', `/api/stations/${id}`),
    reviews:      (id: string) => request('GET', `/api/stations/${id}/reviews`),
    availability: (q: { from: string; to: string; station_id?: string; listing_id?: string }) =>
      request('GET', '/api/stations/availability', { query: q }),
  },

  chargers: {
    listAvailable: () => request('GET', '/api/chargers'),
    reviews:       (id: string) => request('GET', `/api/chargers/${id}/reviews`),
  },

  bookings: {
    list:   () => request('GET', '/api/bookings'),
    get:    (id: string) => request('GET', `/api/bookings/${id}`),
    create: (b: any) => request('POST', '/api/bookings', { body: b }),
    cancel: (id: string, reason?: string) => request('POST', `/api/bookings/${id}/cancel`, { body: { reason } }),
    active: (listingId: string) => request<{ active: boolean }>('GET', `/api/bookings/${listingId}/active`),
  },

  sessions: {
    list:     () => request('GET', '/api/sessions'),
    active:   () => request<{ id: string; station: { name: string | null } | null; listing: { station_name: string | null; address: string | null } | null } | null>('GET', '/api/sessions/active'),
    get:      (id: string) => request('GET', `/api/sessions/${id}`),
    start:    (booking_id: string) => request('POST', '/api/sessions/start', { body: { booking_id } }),
    progress: (id: string, kwh_delivered: number, cost: number) =>
      request('PATCH', `/api/sessions/${id}/progress`, { body: { kwh_delivered, cost } }),
    complete: (id: string, p: { kwh: number; battery_end?: number | null; description?: string; meter_kwh?: number | null }) =>
      request('POST', `/api/sessions/${id}/complete`, { body: p }),
    rate:     (id: string, rating: number, comment?: string) =>
      request('POST', `/api/sessions/${id}/rate`, { body: { rating, comment } }),
  },

  wallet: {
    transactions: () => request('GET', '/api/wallet/transactions'),
  },

  applications: {
    mine:   () => request('GET', '/api/applications/mine'),
    submit: (data: {
      full_name: string; phone: string; station_name?: string | null;
      governorate: string; city: string; latitude: number; longitude: number;
      charger_type: string; power_kw?: number | null;
      electricity_form_name: string; commercial_registration: string; id_card_number: string;
    }) => request('POST', '/api/applications', { body: data }),
  },

  favorites: {
    list:   () => request('GET', '/api/favorites'),
    add:    (target: { station_id?: string; listing_id?: string }) => request('POST', '/api/favorites', { body: target }),
    remove: (id: string) => request('DELETE', `/api/favorites/${id}`),
  },

  payouts: {
    request: (amount: number) => request('POST', '/api/payouts/request', { body: { amount } }),
    mine:    () => request('GET', '/api/payouts/mine'),
    list:    (status?: string) => request('GET', '/api/payouts', { query: { status } }),
    process: (id: string, action: 'paid' | 'reject', note?: string) =>
      request('POST', `/api/payouts/${id}/process`, { body: { action, note } }),
  },

  admin: {
    analytics:    () => request('GET', '/api/admin/analytics'),
    counts:       () => request<{ stations: number; users: number }>('GET', '/api/admin/counts'),
    flagged:      () => request('GET', '/api/admin/flagged'),
    resolveFlag:  (id: string) => request('POST', `/api/admin/flagged/${id}/resolve`),
    users:        () => request('GET', '/api/admin/users'),
    setUserActive:(id: string, is_active: boolean) => request('PATCH', `/api/admin/users/${id}`, { body: { is_active } }),
    deleteUser:   (id: string) => request('DELETE', `/api/admin/users/${id}`),
    applications: () => request('GET', '/api/admin/applications'),
    saveComment:  (id: string, admin_comment: string | null) =>
      request('PATCH', `/api/admin/applications/${id}`, { body: { admin_comment } }),
    deleteApplication: (id: string) => request('DELETE', `/api/admin/applications/${id}`),
    userListing:  (userId: string) =>
      request<{ id: string; tuya_device_id: string | null; tuya_verified: boolean; price_per_kwh: number } | null>(
        'GET', `/api/admin/users/${userId}/listing`),
    updateListing:(id: string, patch: { price_per_kwh?: number; tuya_verified?: boolean }) =>
      request('PATCH', `/api/admin/listings/${id}`, { body: patch }),
    application:  (id: string, action: 'accept' | 'reject' | 'review') =>
      request('POST', `/api/admin/applications/${id}/${action}`, { body: {} }),
  },

  superadmin: {
    admins:      () => request('GET', '/api/superadmin/admins'),
    setAdmin:    (identifier: string, make: boolean) => request('POST', '/api/superadmin/admins', { body: { identifier, make } }),
    settings:    () => request('GET', '/api/superadmin/settings'),
    setSetting:  (key: string, value: string) => request('PUT', '/api/superadmin/settings', { body: { key, value } }),
  },

  host: {
    listing:        () => request('GET', '/api/host/listing'),
    createListing:  () => request('POST', '/api/host/listing'),
    bookings:       () => request('GET', '/api/host/bookings'),
    setAvailability:(is_available: boolean) => request('PATCH', '/api/host/listing/availability', { body: { is_available } }),
    editListing:    (patch: Record<string, any>) => request('PATCH', '/api/host/listing', { body: patch }),
    selfCharge:     () => request<{ session_id: string }>('POST', '/api/host/self-charge'),
  },

  payments: {
    create: (amount: number, save_card = false) =>
      request('POST', '/api/payments/create', { body: { amount, save_card } }),
    verify: (session_id: string) => request('POST', '/api/payments/verify', { body: { session_id } }),

    // Saved credit / debit cards (Thawani tokens — the app never sees a PAN).
    methods: () => request<PaymentMethods>('GET', '/api/payments/methods'),
    addCard: () => request<{ pay_url: string; session_id: string; amount: number }>('POST', '/api/payments/cards/add'),
    setDefaultCard: (token: string) => request('POST', `/api/payments/cards/${encodeURIComponent(token)}/default`),
    removeCard: (token: string) => request('DELETE', `/api/payments/cards/${encodeURIComponent(token)}`),
    setMethod: (method: 'wallet' | 'card') => request('POST', '/api/payments/method', { body: { method } }),
    chargeCard: (amount: number) =>
      request<CardChargeResult>('POST', '/api/payments/cards/charge', { body: { amount } }),
    verifyCardCharge: (reference: string) =>
      request<{ status: 'paid' | 'pending' | 'failed'; balance?: number }>(
        'POST', '/api/payments/cards/charge/verify', { body: { reference } }),
  },

  devices: {
    switch: (target: { booking_id?: string; listing_id?: string; action: 'on' | 'off' }) =>
      request('POST', '/api/devices/switch', { body: target }),
    energy: (target: { booking_id?: string; listing_id?: string }) =>
      request('POST', '/api/devices/energy', { body: target }),
  },

  routing: {
    // Driving route between two points, drawn in-app rather than handing the
    // user off to an external maps app.
    route: (from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) =>
      request<{
        success: boolean;
        distance_m: number;
        duration_s: number;
        coordinates: Array<[number, number]>;
        steps: Array<{ instruction: string; modifier: string | null; name: string; distance_m: number }>;
      }>('POST', '/api/routing/route', { body: { from, to } }),
  },

  // ── Mobile charging — customer side ──────────────────────────────────────
  mobile: {
    config:  () => request<MobileChargeConfig>('GET', '/api/mobile/config'),
    list:    () => request<MobileChargeRequest[]>('GET', '/api/mobile/requests'),
    active:  () => request<MobileChargeRequest | null>('GET', '/api/mobile/requests/active'),
    get:     (id: string) => request<MobileChargeRequest>('GET', `/api/mobile/requests/${id}`),
    // Places the wallet hold. Raises insufficient_balance (402) exactly like
    // sessions.start, so the same card-top-up recovery applies.
    request: (b: { latitude: number; longitude: number; kwh: number; notes?: string; address?: string }) =>
      request<{ request_id: string; held_amount: number; estimated_cost: number;
                callout_fee: number; price_per_kwh: number }>('POST', '/api/mobile/requests', { body: b }),
    cancel:  (id: string, reason?: string) =>
      request<{ already: boolean; fee: number; released: number; balance: number }>(
        'POST', `/api/mobile/requests/${id}/cancel`, { body: { reason } }),
    rate:    (id: string, rating: number, comment?: string) =>
      request('POST', `/api/mobile/requests/${id}/rate`, { body: { rating, comment } }),
  },

  // ── Mobile charging — driver side ────────────────────────────────────────
  operator: {
    me:       () => request<{ van: ServiceVan | null; active_job: OperatorJob | null }>('GET', '/api/operator/me'),
    duty:     (on_duty: boolean, at?: { latitude: number; longitude: number }) =>
      request<ServiceVan>('POST', '/api/operator/duty', { body: { on_duty, ...at } }),
    location: (latitude: number, longitude: number) =>
      request('POST', '/api/operator/location', { body: { latitude, longitude } }),
    jobs:     () => request<{ offered: (OperatorJob & { distance_km: number }) | null; history: OperatorJob[] }>(
      'GET', '/api/operator/jobs'),
    job:      (id: string) => request<OperatorJob>('GET', `/api/operator/jobs/${id}`),
    accept:   (id: string) => request<{ taken: boolean; status: string }>('POST', `/api/operator/jobs/${id}/accept`),
    decline:  (id: string) => request('POST', `/api/operator/jobs/${id}/decline`),
    setStatus: (id: string, status: 'en_route' | 'arrived' | 'charging',
                extra?: { latitude?: number; longitude?: number; eta_minutes?: number }) =>
      request('POST', `/api/operator/jobs/${id}/status`, { body: { status, ...extra } }),
    complete: (id: string, p: { kwh: number; battery_end?: number | null; meter_kwh?: number | null }) =>
      request<{ already: boolean; cost: number; kwh: number; balance: number }>(
        'POST', `/api/operator/jobs/${id}/complete`, { body: p }),
  },

  // ── Fleet + mobile-job oversight (admin) ─────────────────────────────────
  fleet: {
    vans:      () => request<ServiceVan[]>('GET', '/api/admin/vans'),
    operators: () => request<Array<{ id: string; full_name: string; phone: string;
                                     van_id: string | null; van_label: string | null }>>(
      'GET', '/api/admin/operators'),
    createVan: (v: Partial<ServiceVan> & { label: string; capacity_kwh: number }) =>
      request<ServiceVan>('POST', '/api/admin/vans', { body: v }),
    updateVan: (id: string, patch: Partial<ServiceVan>) =>
      request<ServiceVan>('PATCH', `/api/admin/vans/${id}`, { body: patch }),
    refillVan: (id: string) => request<ServiceVan>('POST', `/api/admin/vans/${id}/refill`),
    removeVan: (id: string) => request('DELETE', `/api/admin/vans/${id}`),
    requests:  (status?: string) =>
      request<Array<MobileChargeRequest & { customer_name: string; customer_phone: string;
                                           operator_name: string | null; van_label: string | null }>>(
        'GET', '/api/admin/mobile/requests', { query: status ? { status } : undefined }),
    live:      () => request<{ vans: ServiceVan[]; requests: Array<MobileChargeRequest & { customer_name: string }> }>(
      'GET', '/api/admin/mobile/live'),
    cancel:    (id: string, reason?: string) =>
      request('POST', `/api/admin/mobile/requests/${id}/cancel`, { body: { reason } }),
  },

  // ── Trip planner ─────────────────────────────────────────────────────────
  trips: {
    // Stateless: computes a plan, saves nothing. The app decides what to keep.
    plan: (b: {
      from: { latitude: number; longitude: number };
      to: { latitude: number; longitude: number };
      waypoints?: Array<{ latitude: number; longitude: number }>;
      battery_kwh: number;
      start_soc_pct: number;
      reserve_soc_pct?: number;
      consumption_kwh_per_100km?: number;
      connector_type?: string | null;
    }) => request<TripPlan>('POST', '/api/routing/plan', { body: b }),

    list:   () => request<SavedTrip[]>('GET', '/api/routing/trips'),
    get:    (id: string) => request<SavedTrip>('GET', `/api/routing/trips/${id}`),
    save:   (b: {
      name?: string;
      from: { latitude: number; longitude: number; label?: string };
      to:   { latitude: number; longitude: number; label?: string };
      params: Record<string, any>;
      plan: Record<string, any>;
    }) => request<SavedTrip>('POST', '/api/routing/trips', { body: b }),
    remove: (id: string) => request('DELETE', `/api/routing/trips/${id}`),

    // Only the next unbooked stop may be linked — the server enforces it.
    attachBooking: (tripId: string, seq: number, booking_id: string) =>
      request('POST', `/api/routing/trips/${tripId}/stops/${seq}/booking`, { body: { booking_id } }),
    markStop: (tripId: string, seq: number, action: 'done' | 'skipped') =>
      request('POST', `/api/routing/trips/${tripId}/stops/${seq}/${action}`),
  },

  stationStatus: {
    // Company network station — admin / superadmin only.
    setStation: (id: string, status: string, reason?: string) =>
      request('PATCH', `/api/stations/${id}/status`, { body: { status, reason } }),
    // Private charger — the owning host/investor, or admin / superadmin.
    setListing: (id: string, status: string, reason?: string) =>
      request('PATCH', `/api/listings/${id}/status`, { body: { status, reason } }),
  },

  notifications: {
    // `before` is a created_at cursor from the previous page's next_before.
    list: (opts: { limit?: number; before?: string | null } = {}) => {
      const q = new URLSearchParams();
      if (opts.limit) q.set('limit', String(opts.limit));
      if (opts.before) q.set('before', opts.before);
      const qs = q.toString();
      return request<{
        success: boolean;
        notifications: AppNotification[];
        next_before: string | null;
      }>('GET', `/api/notifications${qs ? `?${qs}` : ''}`);
    },
    unreadCount: () => request<{ success: boolean; count: number }>('GET', '/api/notifications/unread-count'),
    markRead:    (ids: string[]) => request('POST', '/api/notifications/read', { body: { ids } }),
    markAllRead: () => request('POST', '/api/notifications/read-all'),
  },
};

export type AppNotification = {
  id: string;
  category: 'booking' | 'charging' | 'promo';
  kind: string;
  title: string;
  body: string;
  data: Record<string, any>;
  read_at: string | null;
  created_at: string;
};
