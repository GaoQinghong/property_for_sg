/**
 * Re-anchors school coordinates to OneMap's official address points.
 *
 * The list was originally built from OpenStreetMap, whose school nodes sit
 * wherever a mapper dropped them — typically tens of metres off the registered
 * address. That is irrelevant for drawing a pin but decisive for MOE's 1km
 * priority-admission radius, where a 35m error flips a school in or out.
 *
 * Every school carries its postal code, which OneMap resolves exactly.
 *
 *   node scripts/recalibrate-schools.mjs [--dry-run]
 */
import { readFile, writeFile } from "node:fs/promises";
import { distanceMetres, validCoordinates } from "./lib/geo.mjs";

const DATA_FILE = new URL("../public/data/schools.json", import.meta.url);
const dryRun = process.argv.includes("--dry-run");

const ONEMAP_SEARCH = "https://www.onemap.gov.sg/api/common/elastic/search";
let nextCall = 0;

async function lookupPostal(postalCode, attempt = 0) {
  const wait = nextCall - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  nextCall = Date.now() + 350;

  const url = new URL(ONEMAP_SEARCH);
  url.search = new URLSearchParams({ searchVal: postalCode, returnGeom: "Y", getAddrDetails: "Y", pageNum: "1" });
  const response = await fetch(url, { headers: { "User-Agent": "property_for_sg data updater" } });
  if (response.status === 429 && attempt < 4) {
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    return lookupPostal(postalCode, attempt + 1);
  }
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  const hits = payload?.results ?? [];
  // A postal code can return several premises at the same address; they share
  // a location, so the first exact-postal hit is enough.
  const hit = hits.find((r) => r.POSTAL === postalCode) ?? hits[0];
  if (!hit) return null;
  const point = { lat: Number(hit.LATITUDE), lng: Number(hit.LONGITUDE) };
  return validCoordinates(point) ? { ...point, matched: hit.SEARCHVAL } : null;
}

const schools = JSON.parse(await readFile(DATA_FILE, "utf8"));
console.log(`校准 ${schools.length} 所学校的坐标（来源：OneMap 邮编查询）…\n`);

const shifts = [];
let failed = 0;

for (const school of schools) {
  if (!school.postalCode) { failed += 1; continue; }
  const point = await lookupPostal(String(school.postalCode));
  if (!point) {
    failed += 1;
    console.log(`  ✗ ${school.name}（${school.postalCode}）无结果，保留原坐标`);
    continue;
  }
  const moved = distanceMetres(school, point);
  if (moved >= 1) shifts.push({ name: school.name, type: school.type, moved });
  school.lat = point.lat;
  school.lng = point.lng;
}

shifts.sort((a, b) => b.moved - a.moved);
const over = (n) => shifts.filter((s) => s.moved > n).length;

console.log(`\n完成：${schools.length - failed} 所已校准，${failed} 所失败。`);
console.log(`位移 >10m：${over(10)} 所；>50m：${over(50)} 所；>100m：${over(100)} 所。`);
console.log("\n位移最大的 15 所：");
shifts.slice(0, 15).forEach((s) => console.log(`   ${String(Math.round(s.moved)).padStart(5)}m  ${s.type}  ${s.name}`));

if (dryRun) console.log("\n--dry-run：未写入文件。");
else {
  await writeFile(DATA_FILE, `${JSON.stringify(schools, null, 2)}\n`);
  console.log("\n已写入 public/data/schools.json");
}
