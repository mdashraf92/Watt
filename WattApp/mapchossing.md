# GO WATT — Map Provider Decision Report

**Prepared for:** Mohammad Ashraf
**Subject:** Which map provider GO WATT should use for iPhone + Android
**Date:** August 2026
**Status:** Decision paper. Pricing is indicative and must be confirmed with each vendor before contracting.

---

## 1. The decision in one line

**Keep the app's current map architecture (Leaflet + OpenStreetMap in a WebView + self-hosted OSRM). Change only the tile source to a paid provider — recommended: MapTiler. Estimated cost ~USD 0–300/month (~0–115 OMR). Effort: 1–3 developer-days. Works identically on iPhone and Android with no code fork.**

Do **not** migrate to Google Maps or Mapbox native SDKs — both force a rewrite, break Expo Go, and cost more with no benefit for a charging app where the map is a backdrop to your own station data.

---

## 2. What GO WATT runs today (verified in the codebase)

| Layer | Current implementation | Source of truth |
|---|---|---|
| Map rendering | **Leaflet 1.9.4** (loaded from CDN) inside `react-native-webview` 13.16.1 | `src/components/OSMMap.tsx` |
| Tiles | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | `src/components/OSMMap.tsx:108` |
| Routing / directions | **Your own self-hosted OSRM** (`OSRM_URL`) | `backend/src/modules/routing/routing.routes.ts` |
| Native map dependency | **None** — no `react-native-maps`, no Mapbox, no MapLibre, no Google SDK | `package.json` |
| API key / billing | **None** | — |
| Platform | Expo SDK ~56.0.18, React Native 0.85.3, single WebView component | `package.json` |

### Two consequences that drive the whole decision

1. **You are NOT on Google Maps.** There is no Google bill to escape and no migration to justify. The real question is *"what do we upgrade to?"* not *"how do we leave Google?"*

2. **You are provider-agnostic.** Because the map is a Leaflet WebView consuming standard XYZ raster tiles, swapping providers is a **one-line change** to `OSMMap.tsx:108`. This is a major asset: it makes iOS/Android parity automatic (one WebView, no native fork) and makes the cost of picking wrong almost zero.

### The one real problem to fix

The app currently pulls tiles from OpenStreetMap's **donation-funded community server** (`tile.openstreetmap.org`). Its [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) **prohibits production/commercial use** and allows rate-limiting or blocking without notice — most likely right when the app gets popular. **This is a tile-source swap, not a platform migration.** Anyone proposing a rebuild is solving a problem you don't have.

---

## 3. Requirements GO WATT actually needs

| # | Requirement | Why it matters |
|---|---|---|
| R1 | Bilingual labels (Arabic + English), including street level (zoom 17–19) | Hardest part; Oman market |
| R2 | Oman coverage (governorates, wilayats, roads, POIs) | Accuracy |
| R3 | Search / autocomplete (Arabic-first) | Finding stations/addresses |
| R4 | Reverse geocoding → governorate + wilayat in Arabic | Station location context |
| R5 | Routing to charging stations | Currently OSRM (free) |
| R6 | **iPhone + Android parity** | One WebView = automatic parity |
| R7 | Expo Go compatibility | No ejecting/custom dev client |
| R8 | Offline / cached tiles | Low-connectivity charging sites |
| R9 | Predictable cost at scale | Must not spike with usage |
| R10 | Vendor independence | Switch without a rewrite |

---

## 4. The options, compared

### Option A — Harden the current stack with a commercial tile provider ✅ RECOMMENDED

Keep Leaflet, the WebView, and OSRM. Change the tile URL and add an API key.

| Provider | Free tier (indicative) | Paid entry (indicative) | Arabic labels |
|---|---|---|---|
| **MapTiler** *(recommended)* | ~100k tile requests/mo | from ~USD 25/mo | **Yes** — explicit `name:ar` language switching |
| Stadia Maps | ~200k tiles/mo (non-commercial) | from ~USD 20/mo | Partial |
| Thunderforest | ~150k tiles/mo | from ~EUR 9/mo | Limited |
| Self-hosted tiles | Server cost only | ~USD 40–150/mo VPS | Full control |

**How it scores:** R5 (routing) unchanged — OSRM keeps working. R6/R7 perfect — zero architecture change, Expo Go intact, one WebView serves both iPhone and Android. R9/R10 excellent — low, predictable, one line to switch again. R1 good with MapTiler (weaker only at street level in newer suburbs, which is an OSM-data gap, not a provider gap). R4 solvable for free by loading Oman wilayat boundary polygons into your own backend and doing point-in-polygon locally — accurate, offline, vendor-free.

**Pros:** cheapest, fastest, lowest risk, keeps everything already built, no lock-in, ships this week, identical on both platforms.
**Cons:** Arabic street-level labelling depends on OSM community data; POI density thinner than Google; you own operational responsibility.

---

### Option B — Google Maps Platform ❌ REJECT

**Blocker:** Google tiles **cannot legally be used in Leaflet** — Google's ToS prohibit accessing Maps content except through Google's own SDKs. So Google is **a rewrite, not a swap**: remove Leaflet + WebView, adopt `react-native-maps`, **leave Expo Go** (custom dev client / prebuild), rebuild every map feature, and maintain two native key configurations (separate iOS + Android).

- R1/R2/R3: **Excellent** data — best Arabic street labels and POIs in Oman.
- R6: two native surfaces to maintain instead of one WebView.
- R7: **Fails Expo Go** — permanent workflow downgrade.
- R8: caching Google tiles is prohibited.
- R9: **Poor** — per-map-load + per-request billing across multiple SKUs; a consumer EV app with repeated map opens is exactly what Google bills hardest. Cost scales with your success.
- R10: **Severe lock-in** — leaving means a second rewrite.

**Verdict:** best data on earth, bought at the cost of your architecture, Expo workflow, offline capability, free routing, and an unbounded bill — for a map that is only a *backdrop* to your own charging network. **Reject.**

---

### Option C — GeoMakani (Emad Al Ramimi) ⏸️ EVALUATE, DON'T COMMIT

| Option | Price | Scope |
|---|---|---|
| Full development | **2,200 OMR** | Frontend + backend + DB config. **Excludes hosting/deployment.** |
| Map layer configuration | **1,200 OMR** | Backend APIs + frontend map access. **Excludes search-bar UI.** |

**Genuinely strong:** honest technical read (correctly names Arabic labelling at zoom 17–19 as the weak point, won't promise an SLA before testing); confirms Leaflet XYZ compatibility (no architecture change — same advantage as Option A); reverse geocoding on **official Oman wilayat polygons** would beat anything Google or Mapbox returns; offline caching offered; local vendor, local language, local accountability.

**Unresolved / concerning:**
- Entire proposal depends on **GIS Hub bilingual data you don't control** — if its Arabic street naming is weak, you paid 1,200–2,200 OMR for ~OSM quality.
- **Recurring cost — unanswered** (asked once).
- **Which provider sits behind the layer — unanswered.**
- **Who owns the account/keys — unanswered** (decides whether you can ever leave).
- Hosting excluded (unspecified extra). Search UI excluded. Routing is "phase two," priced separately, and may fall back to OSM — which your OSRM already does for free. No SLA. Small-vendor concentration risk.

**Verdict:** strategically the most interesting for an Oman-first product, but **not yet evaluable**. Four commercial questions remain unanswered. Do not sign until answered in writing — and only via a small paid pilot (§8).

---

### Option D — Mapbox ❌ REJECT (for this architecture)

Mapbox's attractive pricing (free monthly-active-user tier) applies to its **native mobile SDKs**, which you don't use. Through Leaflet you'd consume the **Raster Tiles API**, billed **per tile request** — one map interaction fetches dozens of tiles. To get the good pricing you'd have to adopt the native SDK, which — like Google — means abandoning Leaflet and Expo Go.

- R1/R3: good Arabic support. R2: good, POIs thinner than Google.
- R9: **per-tile billing punishes WebView usage.** R7: fails Expo Go if you go native.

**Verdict:** a good product, simply **mismatched to your architecture**. Strictly worse than MapTiler for a Leaflet app, strictly worse than Google if you were rewriting natively anyway. No winning position here. **Reject.**

---

## 5. Side-by-side scoring (1–5, higher is better)

| Criterion | Weight | **A: OSM + MapTiler** | B: Google | C: GeoMakani | D: Mapbox |
|---|---|---|---|---|---|
| Arabic labels (street level) | High | 3 | 5 | 4 (unverified) | 4 |
| Oman admin accuracy (wilayat) | High | 3 | 3 | **5** | 3 |
| Fits current architecture | High | **5** | 1 | **5** | 3 |
| Expo Go preserved | High | **5** | 1 | **5** | 2 |
| iPhone/Android parity | High | **5** | 4 | **5** | 4 |
| Cost predictability | High | **5** | 1 | 2 (unknown) | 3 |
| Time to production | High | **5** | 1 | 2 | 4 |
| Offline capability | Medium | 4 | 1 | 4 | 3 |
| Vendor independence | Medium | **5** | 1 | 2 | 3 |
| POI / search richness | Medium | 3 | **5** | 3 | 4 |
| **Overall** | | **🥇 Winner** | Low | Mid (high variance) | Mid |

---

## 6. Total cost comparison (indicative — verify before contracting)

| Option | Year 1 | Ongoing | Scales with users? | iPhone + Android | Rewrite needed? |
|---|---|---|---|---|---|
| **A — MapTiler** ✅ | ~0–1,200 OMR | ~0–115 OMR/mo | Mildly | ✅ one WebView | ❌ no (1 line) |
| A2 — Self-hosted tiles | ~200–700 OMR | ~15–60 OMR/mo | No (server only) | ✅ one WebView | ❌ no |
| B — Google | Rewrite + usage | Grows continuously | **Aggressively** | ⚠️ two native configs | ✅ yes |
| C — GeoMakani | 1,200–2,200 OMR + hosting + search UI + routing ph.2 | **Unknown** | Unknown | ✅ (XYZ tiles) | ❌ no |
| D — Mapbox | Usage-based | Per-tile | **Yes, per tile** | ⚠️ native for good price | ⚠️ for good price |

**Option A can be piloted at zero cost on the free tier before any commitment.** Option C requires payment before you learn whether the Arabic data is good enough — unless you insist on the paid-pilot structure below.

---

## 7. Final recommendation — choose ONE

> **Adopt Option A: MapTiler tiles on the existing Leaflet + WebView + OSRM stack.**

Why this and not the others, in one breath: it is the only option that fixes the actual problem (the unlicensed community tile server), keeps the app you already built, runs **identically on iPhone and Android from a single WebView**, preserves Expo Go, keeps your free OSRM routing, costs near-zero to start, and lets you change your mind later with one line of code. Google and Mapbox demand a native rewrite you don't need; GeoMakani isn't evaluable until four commercial questions are answered.

---

## 8. Action plan

### Phase 1 — This week (~1–3 dev-days) — DO NOW
1. Register a **MapTiler** account (free tier). Swap `OSMMap.tsx:108` to the MapTiler tile URL with Arabic language preference enabled.
2. Keep Leaflet, the WebView, Expo Go, and self-hosted OSRM — all unchanged.
3. Load Oman governorate/wilayat boundary polygons into the backend; implement reverse geocoding (R4) as local point-in-polygon — accurate, free, offline, vendor-free.
4. Implement search against MapTiler Geocoding or your own station/POI table (your chargers are your own data anyway).

**Result:** the Tile Usage Policy risk is gone, the app is production-legal on both platforms, and you've spent almost nothing.

### Phase 2 — In parallel (2–4 weeks) — evaluate GeoMakani properly
- Get **written answers to the questions in §9 first.**
- Send Emad the GIS Hub sample he requested.
- Insist on a **paid pilot** — small fixed fee, one governorate, working tile + geocoding endpoint — not a full commitment.
- Benchmark head-to-head against your live MapTiler layer: same 30 Omani addresses, zoom 17–19, Arabic labels.
- **If GeoMakani measurably beats MapTiler on Arabic street-level naming and official wilayat accuracy, it's worth paying for.** If it only matches OSM, you saved 2,200 OMR and one line of code was all you ever needed.

### Phase 3 — Only if scale demands it
Self-host your own tile server alongside your existing OSRM box. You already run OSRM, so the skill exists. Caps cost permanently, removes every vendor.

### Explicitly reject
- **Google Maps** — architectural rewrite, loss of Expo Go, loss of offline, unbounded cost, severe lock-in.
- **Mapbox** — no winning position in a Leaflet/WebView architecture.

---

## 9. Questions Emad (GeoMakani) must answer in writing before any commitment

1. Is 2,200 / 1,200 OMR **one-time only**, or is there a recurring monthly/annual fee? *(Asked once — unanswered.)*
2. Which provider/data source sits behind the 1,200 OMR map layer — self-hosted OSM, GIS Hub data, or a third party? *(Asked once — unanswered.)*
3. **Who owns the account, the API keys, and the tile cache** — GO WATT or GeoMakani? If we terminate, what do we keep? *(Asked once — unanswered.)*
4. Estimated hosting/deployment cost excluded from the quote?
5. SLA — uptime %, support response time, penalty terms?
6. Pricing/timeline for phase-two routing, and does it use GIS Hub data or fall back to OSM? *(If OSM, we already have this free via OSRM.)*
7. Is a **paid pilot** available — one governorate, fixed fee, before full commitment?
8. If GIS Hub's Arabic street naming is incomplete, is the fee reduced or the scope reduced at the same fee?

---

## 10. One-paragraph summary for management

> GO WATT does not use Google Maps. It renders free OpenStreetMap tiles through Leaflet in a WebView, with routing on our own OSRM server — one implementation that already works identically on iPhone and Android. The only real risk is that the OSM community tile server is not licensed for production. This is fixable in a single line of code by moving to a commercial tile provider such as **MapTiler**, at near-zero cost, with no architecture change, no loss of Expo Go, and full iOS/Android parity. Migrating to Google Maps or Mapbox's native SDK would mean abandoning Leaflet and Expo, rebuilding the map layer natively, losing offline caching, and accepting usage-based costs that grow with our success — a poor trade for an app where the map is a backdrop to our own charging-station data. The GeoMakani proposal is strategically interesting because official Omani wilayat boundaries with Arabic names would give us reverse geocoding no global provider can match, but four commercial questions remain unanswered and it depends on unverified GIS Hub data. **Recommendation: adopt MapTiler now for near-zero cost, and evaluate GeoMakani through a small paid pilot in parallel — do not commit 2,200 OMR up front.**

---

*Pricing and free-tier figures are indicative and should be confirmed directly with each vendor before contracting.*
