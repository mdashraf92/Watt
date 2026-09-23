import { createHash, createHmac } from 'crypto';
import { env } from '../config/env';

// Tuya OpenAPI client — signed calls to control a smart switch and read energy.
// Ported from the control-tuya-switch / auto-shutoff edge functions.
const BASE = env.TUYA_BASE_URL;
const CLIENT_ID = env.TUYA_CLIENT_ID ?? '';
const CLIENT_SECRET = env.TUYA_CLIENT_SECRET ?? '';

export function tuyaConfigured(): boolean {
  return !!(CLIENT_ID && CLIENT_SECRET);
}

const sha256hex = (s: string) => createHash('sha256').update(s).digest('hex');
const hmac = (msg: string) => createHmac('sha256', CLIENT_SECRET).update(msg).digest('hex').toUpperCase();

async function getToken(): Promise<string> {
  const t = Date.now().toString();
  const path = '/v1.0/token?grant_type=1';
  const strSign = ['GET', sha256hex(''), '', path].join('\n');
  const sign = hmac(`${CLIENT_ID}${t}${strSign}`);
  const res = await fetch(`${BASE}${path}`, {
    signal: AbortSignal.timeout(10_000),
    headers: { client_id: CLIENT_ID, sign_method: 'HMAC-SHA256', t, sign },
  });
  const data = await res.json() as any;
  if (!data.success) throw new Error(`Tuya token: ${data.msg}`);
  return data.result.access_token as string;
}

async function call(method: string, path: string, body?: object): Promise<any> {
  const token = await getToken();
  const t = Date.now().toString();
  const bodyStr = body ? JSON.stringify(body) : '';
  const strSign = [method, sha256hex(bodyStr), '', path].join('\n');
  const sign = hmac(`${CLIENT_ID}${token}${t}${strSign}`);
  const res = await fetch(`${BASE}${path}`, {
    signal: AbortSignal.timeout(10_000),
    method,
    headers: {
      client_id: CLIENT_ID, access_token: token, sign_method: 'HMAC-SHA256', t, sign,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(bodyStr ? { body: bodyStr } : {}),
  });
  return res.json();
}

const SWITCH_CODES = ['switch_1', 'switch', 'switch_on', 'switch_2', 'switch_3'];

// Package charging uses explicitly verified device codes and units. The older
// heuristic readEnergy() is intentionally not used for entitlement accounting.
export async function readPackageDevice(device: { device_id: string; switch_code: string; energy_code: string; energy_scale: number }) {
  if (!tuyaConfigured()) throw new Error('Device control not configured');
  const r = await call('GET', `/v1.0/devices/${encodeURIComponent(device.device_id)}/status`);
  if (!r.success || !Array.isArray(r.result)) throw new Error('Device status unavailable');
  const on = r.result.find((v: any) => v.code === device.switch_code)?.value;
  const raw = r.result.find((v: any) => v.code === device.energy_code)?.value;
  if (typeof on !== 'boolean') throw new Error('Switch state unavailable');
  // Preserve an invalid meter as NaN so OFF can still be confirmed, while the
  // session is flagged and its package blocked for reconciliation.
  const energy = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
    ? raw * Number(device.energy_scale) : NaN;
  return { on, energy };
}

export async function switchPackageDevice(device: { device_id: string; switch_code: string }, on: boolean) {
  if (!tuyaConfigured()) throw new Error('Device control not configured');
  const r = await call('POST', `/v1.0/devices/${encodeURIComponent(device.device_id)}/commands`, {
    commands: [{ code: device.switch_code, value: on }],
  });
  if (!r.success) throw new Error('Device did not acknowledge switch command');
}

async function findSwitchCode(deviceId: string): Promise<string> {
  const statusRes = await call('GET', `/v1.0/devices/${deviceId}/status`);
  if (!statusRes.success) throw new Error(`Tuya status: ${statusRes.msg}`);
  const status: { code: string; value: unknown }[] = statusRes.result ?? [];
  let code = SWITCH_CODES.find(c => status.some(x => x.code === c && typeof x.value === 'boolean'));
  if (!code) code = status.find(x => typeof x.value === 'boolean' && x.code.toLowerCase().includes('switch'))?.code;
  if (!code) throw new Error('Device reports no switch function');
  return code;
}

export async function setSwitch(deviceId: string, on: boolean) {
  const code = await findSwitchCode(deviceId);
  const r = await call('POST', `/v1.0/devices/${deviceId}/commands`, { commands: [{ code, value: on }] });
  if (!r.success) throw new Error(`Tuya switch failed: ${r.msg}`);
  return true;
}

// Read live power (W) and cumulative energy (kWh) if the device reports them.
export async function readEnergy(deviceId: string): Promise<{ power_w: number | null; energy_kwh: number | null }> {
  const statusRes = await call('GET', `/v1.0/devices/${deviceId}/status`);
  const status: { code: string; value: any }[] = statusRes.result ?? [];
  const get = (codes: string[]) => status.find(x => codes.includes(x.code))?.value;
  const powerRaw = get(['cur_power', 'power']);            // often deci-watts
  const energyRaw = get(['add_ele', 'total_energy', 'energy']);
  return {
    power_w: powerRaw != null ? Number(powerRaw) * (powerRaw > 5000 ? 0.1 : 1) : null,
    energy_kwh: energyRaw != null ? Number(energyRaw) / 1000 : null,
  };
}
