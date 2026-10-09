import { env } from '../config/env';

// Beanz (beanz.ae) — MENU SYNC ONLY. Orders never go to Beanz; they reach the
// café through the Go Watt staff board (modules/cafe).
//
// Beanz has not yet shared its partner API. Everything that depends on its wire
// format is in mapItem() / extractItems() below, written against the shape most
// menu APIs use (categories → items → modifier groups → modifiers). When Beanz
// shares the real format, change only those two functions and the fixture test;
// the sync job and database contract stay the same.

export type MenuChoice = { id: string; name: string; name_ar: string; price_delta: number };
export type MenuOptionGroup = { id: string; name: string; name_ar: string; required: boolean; max: number; choices: MenuChoice[] };
export type NormalizedMenuItem = {
  external_id: string;
  category: string; category_ar: string;
  name: string; name_ar: string;
  description: string; description_ar: string;
  price: number;
  image_url: string | null;
  available: boolean;
  options: MenuOptionGroup[];
};

export function beanzConfigured(): boolean {
  return !!(env.BEANZ_API_URL && env.BEANZ_API_KEY);
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));
const money = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(str(v));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : null;
};
// Accept { en, ar } objects, name/name_ar pairs, or a plain string.
const text = (raw: any, key: string) => {
  const v = raw?.[key];
  if (v && typeof v === 'object') return { en: str(v.en), ar: str(v.ar) || str(v.en) };
  return { en: str(v), ar: str(raw?.[`${key}_ar`]) || str(v) };
};

function mapItem(raw: any, category: { en: string; ar: string }): NormalizedMenuItem | null {
  const id = str(raw?.id ?? raw?.external_id ?? raw?.sku);
  const name = text(raw, 'name');
  const price = money(raw?.price);
  if (!id || !name.en || price === null) return null;
  const desc = text(raw, 'description');
  const groups: any[] = raw?.modifier_groups ?? raw?.options ?? [];
  return {
    external_id: id,
    category: category.en, category_ar: category.ar,
    name: name.en, name_ar: name.ar,
    description: desc.en, description_ar: desc.ar,
    price,
    image_url: str(raw?.image_url ?? raw?.image) || null,
    available: raw?.available !== false && raw?.is_available !== false,
    options: groups.map((g: any) => {
      const gname = text(g, 'name');
      const choices: any[] = g?.modifiers ?? g?.choices ?? [];
      return {
        id: str(g?.id) || gname.en,
        name: gname.en, name_ar: gname.ar,
        required: !!(g?.required ?? (Number(g?.min ?? 0) > 0)),
        max: Math.max(1, Number(g?.max ?? 1) || 1),
        choices: choices.map((c: any) => {
          const cname = text(c, 'name');
          return { id: str(c?.id) || cname.en, name: cname.en, name_ar: cname.ar, price_delta: money(c?.price ?? c?.price_delta) ?? 0 };
        }).filter(c => c.id && c.name),
      };
    }).filter(g => g.choices.length > 0),
  };
}

/** Normalise a Beanz menu payload. Exported for the fixture test. */
export function extractItems(payload: any): NormalizedMenuItem[] {
  const categories: any[] = payload?.data?.categories ?? payload?.categories ?? [];
  const items: NormalizedMenuItem[] = [];
  for (const cat of categories) {
    const category = text(cat, 'name');
    for (const raw of cat?.items ?? []) {
      const item = mapItem(raw, category);
      if (item) items.push(item);
    }
  }
  // A flat list is also accepted.
  for (const raw of payload?.data?.items ?? payload?.items ?? []) {
    const item = mapItem(raw, text(raw, 'category'));
    if (item) items.push(item);
  }
  const seen = new Set<string>();
  return items.filter(i => !seen.has(i.external_id) && seen.add(i.external_id));
}

export async function fetchMenu(storeId: string): Promise<NormalizedMenuItem[]> {
  if (!beanzConfigured()) throw new Error('Beanz is not configured');
  const res = await fetch(`${env.BEANZ_API_URL!.replace(/\/$/, '')}/stores/${encodeURIComponent(storeId)}/menu`, {
    headers: { Authorization: `Bearer ${env.BEANZ_API_KEY}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Beanz menu error: HTTP ${res.status}`);
  const items = extractItems(await res.json());
  // An empty menu is far more likely a format or outage problem than a café
  // that sells nothing; refuse it so the sync does not mark everything unavailable.
  if (!items.length) throw new Error('Beanz returned an empty menu');
  return items;
}
