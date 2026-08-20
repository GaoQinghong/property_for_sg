/** Shared geo helpers for the data scripts. */

// Rough bounding box of Singapore, used to reject bad geocoding results.
export const SG_BOUNDS = { minLat: 1.13, maxLat: 1.49, minLng: 103.59, maxLng: 104.12 };

export function validCoordinates(point) {
  return Boolean(point)
    && Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && point.lat >= SG_BOUNDS.minLat && point.lat <= SG_BOUNDS.maxLat
    && point.lng >= SG_BOUNDS.minLng && point.lng <= SG_BOUNDS.maxLng;
}

/** Great-circle distance in metres. */
export function distanceMetres(a, b) {
  const radius = 6371000;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

/** Nearest entry of `points` to `origin`, or null when `points` is empty. */
export function nearest(origin, points) {
  let best = null;
  for (const point of points) {
    const metres = distanceMetres(origin, point);
    if (!best || metres < best.metres) best = { point, metres };
  }
  return best;
}

export function formatDistance(metres) {
  return metres < 1000 ? `${Math.round(metres / 10) * 10}m` : `${(metres / 1000).toFixed(1)}km`;
}

/**
 * OneMap's search endpoint. Note the query must NOT be suffixed with
 * ", Singapore" — the elastic index has no country field and such queries
 * return zero results, which previously pushed every project onto the
 * district-centre fallback.
 */
const ONEMAP_SEARCH = "https://www.onemap.gov.sg/api/common/elastic/search";
const MIN_INTERVAL_MS = 350;
let nextAllowedCall = 0;

async function throttle() {
  const wait = nextAllowedCall - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  nextAllowedCall = Date.now() + MIN_INTERVAL_MS;
}

async function searchPage(searchVal, pageNum, attempt = 0) {
  await throttle();
  const url = new URL(ONEMAP_SEARCH);
  url.search = new URLSearchParams({ searchVal, returnGeom: "Y", getAddrDetails: "Y", pageNum: String(pageNum) });
  const response = await fetch(url, { headers: { "User-Agent": "property_for_sg data updater" } });
  if (response.status === 429 && attempt < 4) {
    await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
    return searchPage(searchVal, pageNum, attempt + 1);
  }
  if (!response.ok) return { results: [], totalPages: 0 };
  const payload = await response.json().catch(() => null);
  return {
    results: (payload?.results ?? [])
      .map((hit) => ({
        lat: Number(hit.LATITUDE),
        lng: Number(hit.LONGITUDE),
        label: String(hit.SEARCHVAL ?? ""),
        address: String(hit.ADDRESS ?? ""),
        postal: String(hit.POSTAL ?? ""),
      }))
      .filter(validCoordinates),
    totalPages: Number(payload?.totalNumPages ?? 1),
  };
}

/**
 * Every OneMap hit for a query. The API pages at 10 results, and a landed
 * estate can register far more addresses than that, so paginate — a truncated
 * list would silently understate how far a development spreads.
 */
export async function searchAddresses(searchVal, { maxPages = 6 } = {}) {
  const first = await searchPage(searchVal, 1);
  const all = [...first.results];
  const pages = Math.min(first.totalPages, maxPages);
  for (let page = 2; page <= pages; page += 1) {
    const next = await searchPage(searchVal, page);
    all.push(...next.results);
  }
  return all;
}

async function searchOnce(searchVal, attempt = 0) {
  await throttle();
  const url = new URL(ONEMAP_SEARCH);
  url.search = new URLSearchParams({ searchVal, returnGeom: "Y", getAddrDetails: "Y", pageNum: "1" });
  const response = await fetch(url, { headers: { "User-Agent": "property_for_sg data updater" } });
  // OneMap rate-limits aggressively and answers 429 with an HTML body.
  if (response.status === 429 && attempt < 4) {
    await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
    return searchOnce(searchVal, attempt + 1);
  }
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  const hit = payload?.results?.[0];
  if (!hit) return null;
  const point = { lat: Number(hit.LATITUDE), lng: Number(hit.LONGITUDE) };
  return validCoordinates(point) ? point : null;
}

/**
 * Geocode a project by trying progressively looser queries. Returns the first
 * result that lands inside Singapore, or null.
 */
export async function geocodeProject({ project, street }) {
  const queries = [];
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const add = (value) => { if (value && !queries.includes(value)) queries.push(value); };

  add(clean(street));
  add(clean(project));
  // Strip unit/block prefixes such as "99 STILL ROAD" -> "STILL ROAD".
  add(clean(street).replace(/^[\d/&-]+\s+/, ""));
  // URA joins multi-frontage sites with slashes ("Nim Road/Ang Mo Kio Ave 5");
  // the combined string matches nothing, but each road on its own does.
  for (const part of clean(street).split("/")) add(clean(part));

  for (const query of queries) {
    try {
      const point = await searchOnce(query);
      if (point) return point;
    } catch {
      // Network hiccup on one variant should not abort the remaining ones.
    }
  }
  return null;
}
