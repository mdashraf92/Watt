// ─── Central app configuration / environment ────────────────────────────────
// The backend the app talks to is chosen AT BUILD TIME via EXPO_PUBLIC_* vars:
//   • locally     → from the .env file (see .env / npx expo start -c)
//   • EAS builds  → from each build profile's `env` in eas.json
// Only EXPO_PUBLIC_* names are inlined into the app; they must be referenced
// with static dot notation (Expo requirement).

export type AppEnv = 'development' | 'preview' | 'production';

const APP_ENV: AppEnv =
  (process.env.EXPO_PUBLIC_APP_ENV as AppEnv) ?? 'development';

// The GO WATT backend (self-hosted, Supabase-free). Point this at your server, e.g.
//   EXPO_PUBLIC_API_URL=https://api.gowatt.om   (or http://<server-ip>:8080 for testing)
const API_URL =
  (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');

// Mapbox public access token (pk.*) — tile source for every map screen, read
// by OSMMap.tsx. Empty is a valid state (falls back to plain OpenStreetMap
// tiles), so nothing crashes if this hasn't been configured yet.
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

export const ENV = {
  apiUrl:       API_URL,
  appEnv:       APP_ENV,
  isProduction: APP_ENV === 'production',
  // Host only, for display (e.g. "api.gowatt.om").
  backendHost:  API_URL.replace(/^https?:\/\//, '').replace(/\/$/, ''),
  mapboxToken:  MAPBOX_TOKEN,
};
