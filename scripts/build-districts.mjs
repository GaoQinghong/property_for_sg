/**
 * Builds D01–D28 boundary polygons for the map.
 *
 * Singapore publishes no official geometry for its postal districts: they are
 * defined by postal-code sectors, not by drawn boundaries. So take URA's
 * official Master Plan subzone polygons as the geometric base and label each
 * subzone with the district of the postal codes that fall inside it. Adjacent
 * subzones sharing a district then read as one block on the map.
 *
 * Labelling evidence, in order of preference:
 *   1. schools and projects already in the repo, whose postal codes are known
 *   2. OneMap address lookups for the subzone's own name
 *   3. the nearest already-labelled subzone, for the ones with no addresses at
 *      all (reservoirs, military ground, port) — these are flagged `inferred`
 *
 *   node scripts/build-districts.mjs [--dry-run]
 */
import { readFile, writeFile } from "node:fs/promises";
import polygonClipping from "polygon-clipping";
import { centroidOf, containsPoint, districtOfPostal } from "./lib/districts.mjs";
import { distanceMetres, searchAddresses } from "./lib/geo.mjs";

const dataUrl = (name) => new URL(`../public/data/${name}`, import.meta.url);
const dryRun = process.argv.includes("--dry-run");

const SUBZONE_DATASET = "d_8594ae9ff96d0c708bc2af633048edfb";
const SIMPLIFY_TOLERANCE_M = 25;

async function fetchSubzones() {
  const poll = await fetch(`https://api-open.data.gov.sg/v1/public/api/datasets/${SUBZONE_DATASET}/poll-download`)
    .then((r) => r.json());
  if (!poll?.data?.url) throw new Error(`data.gov.sg 未返回下载地址：${JSON.stringify(poll).slice(0, 200)}`);
  const geojson = await fetch(poll.data.url).then((r) => r.json());
  if (!geojson?.features?.length) throw new Error("分区边界为空");
  return geojson;
}

// ---- geometry helpers -------------------------------------------------------

const METRES_PER_DEG_LAT = 110574;
const METRES_PER_DEG_LNG = 111320 * Math.cos((1.35 * Math.PI) / 180);

function perpendicular(point, start, end) {
  const px = point[0] * METRES_PER_DEG_LNG, py = point[1] * METRES_PER_DEG_LAT;
  const sx = start[0] * METRES_PER_DEG_LNG, sy = start[1] * METRES_PER_DEG_LAT;
  const ex = end[0] * METRES_PER_DEG_LNG, ey = end[1] * METRES_PER_DEG_LAT;
  const dx = ex - sx, dy = ey - sy;
  if (dx === 0 && dy === 0) return Math.hypot(px - sx, py - sy);
  const t = Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (sx + t * dx), py - (sy + t * dy));
}

function simplify(points, tolerance) {
  if (points.length < 3) return points;
  let max = 0, index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = perpendicular(points[i], points[0], points[points.length - 1]);
    if (d > max) { max = d; index = i; }
  }
  if (max <= tolerance) return [points[0], points[points.length - 1]];
  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ];
}

const round = (ring) => ring.map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))]);

function simplifyRing(ring, tolerance) {
  if (ring.length < 4) return [];
  const first = ring[0], last = ring[ring.length - 1];
  // Douglas-Peucker treats the first and last point as a baseline. GeoJSON
  // rings repeat the first point at the end, producing a zero-length baseline
  // and unstable simplification. Open the ring, simplify, then close it again.
  const open = first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
  const reduced = round(simplify(open, tolerance));
  if (reduced.length < 3) return [];
  return [...reduced, reduced[0]];
}

function simplifyGeometry(geometry, tolerance) {
  const polygons = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  const out = polygons
    .map((rings) => rings
      .map((ring) => simplifyRing(ring, tolerance))
      // A ring needs 4 positions to stay a closed polygon.
      .filter((ring) => ring.length >= 4))
    .filter((rings) => rings.length > 0);
  if (!out.length) return null;
  return out.length === 1
    ? { type: "Polygon", coordinates: out[0] }
    : { type: "MultiPolygon", coordinates: out };
}

// ---- build ------------------------------------------------------------------

console.log("下载 URA Master Plan 分区边界…");
const subzones = await fetchSubzones();
console.log(`  ${subzones.features.length} 个分区\n`);

const [schools, projectsFile] = await Promise.all([
  readFile(dataUrl("schools.json"), "utf8").then(JSON.parse),
  readFile(dataUrl("projects.json"), "utf8").then(JSON.parse),
]);

// Known postal points: schools carry their postal code directly.
const knownPoints = schools
  .filter((school) => school.postalCode)
  .map((school) => ({ lat: school.lat, lng: school.lng, district: districtOfPostal(school.postalCode) }))
  .filter((point) => point.district);
console.log(`本地已知邮编点：${knownPoints.length} 个（学校）`);

const records = subzones.features.map((feature) => ({
  name: feature.properties.SUBZONE_N,
  planningArea: feature.properties.PLN_AREA_N,
  geometry: feature.geometry,
  centroid: centroidOf(feature.geometry),
  votes: new Map(),
}));

const vote = (record, district) => {
  if (!district) return;
  record.votes.set(district, (record.votes.get(district) ?? 0) + 1);
};

for (const point of knownPoints) {
  const hit = records.find((record) => containsPoint(record.geometry, point));
  if (hit) vote(hit, point.district);
}
for (const project of projectsFile.projects) {
  const hit = records.find((record) => containsPoint(record.geometry, project));
  // Projects carry URA's district label, which matches the postal district
  // everywhere except a couple of boundary cases; treat it as one vote.
  const district = Number(/\bD(\d{1,2})\b/.exec(project.area ?? "")?.[1]);
  if (hit && district) vote(hit, district);
}

const unlabelled = () => records.filter((record) => record.votes.size === 0);
console.log(`本地数据覆盖 ${records.length - unlabelled().length}/${records.length} 个分区，其余查 OneMap…\n`);

for (const record of unlabelled()) {
  const hits = await searchAddresses(record.name, { maxPages: 2 });
  let matched = 0;
  for (const hit of hits) {
    if (!/^\d{6}$/.test(hit.postal)) continue;
    if (!containsPoint(record.geometry, hit)) continue;
    vote(record, districtOfPostal(hit.postal));
    matched += 1;
  }
  if (!matched) {
    const viaArea = await searchAddresses(record.planningArea, { maxPages: 2 });
    for (const hit of viaArea) {
      if (!/^\d{6}$/.test(hit.postal)) continue;
      if (!containsPoint(record.geometry, hit)) continue;
      vote(record, districtOfPostal(hit.postal));
    }
  }
}

const stillBlank = unlabelled();
console.log(`OneMap 之后仍无地址的分区：${stillBlank.length} 个（水体 / 军事用地 / 港口等），按最近已标注分区推断`);

const labelled = records.filter((record) => record.votes.size > 0);
for (const record of stillBlank) {
  if (!record.centroid) continue;
  let best = null;
  for (const other of labelled) {
    if (!other.centroid) continue;
    const d = distanceMetres(record.centroid, other.centroid);
    if (!best || d < best.d) best = { d, other };
  }
  if (best) {
    record.inferred = true;
    vote(record, [...best.other.votes.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  }
}

// ---- emit -------------------------------------------------------------------

const features = [];
let dropped = 0;
for (const record of records) {
  if (!record.votes.size) { dropped += 1; continue; }
  const ranked = [...record.votes.entries()].sort((a, b) => b[1] - a[1]);
  const district = ranked[0][0];
  const geometry = simplifyGeometry(record.geometry, SIMPLIFY_TOLERANCE_M);
  if (!geometry) { dropped += 1; continue; }
  features.push({
    type: "Feature",
    properties: {
      district,
      subzone: record.name,
      planningArea: record.planningArea,
      // Planning-area boundaries are not postal boundaries: a subzone can hold
      // addresses from two districts, so record every district seen inside it
      // rather than pretending the majority is the whole truth.
      ...(ranked.length > 1 ? { straddles: ranked.map(([d]) => d) } : {}),
      ...(record.inferred ? { inferred: true } : {}),
    },
    geometry,
  });
}

// Dissolve the subzones into one geometry per D district. The subzone features
// still carry the supply fill and tooltips; these 28 geometries are drawn as a
// separate heavy outline so the user sees postal districts rather than a mesh
// of 332 planning subzones.
const boundaries = [];
for (let district = 1; district <= 28; district += 1) {
  const geometries = records
    .filter((record) => record.votes.size
      && [...record.votes.entries()].sort((a, b) => b[1] - a[1])[0][0] === district)
    .map((record) => record.geometry.type === "MultiPolygon"
      ? record.geometry.coordinates
      : [record.geometry.coordinates]);
  if (!geometries.length) continue;
  const dissolved = polygonClipping.union(...geometries);
  const geometry = simplifyGeometry({ type: "MultiPolygon", coordinates: dissolved }, 12);
  if (geometry) boundaries.push({ type: "Feature", properties: { district }, geometry });
}

const byDistrict = {};
features.forEach((f) => { byDistrict[f.properties.district] = (byDistrict[f.properties.district] ?? 0) + 1; });
const missing = [...Array(28)].map((_, i) => i + 1).filter((d) => !byDistrict[d]);

// Area-weighted centroid per district, so the map places one label in each
// district's bulk instead of guessing from a bounding box — which for a
// multi-part district can land in the sea.
const labels = {};
const accumulator = new Map();
for (const record of records) {
  if (!record.votes.size || !record.centroid) continue;
  const district = [...record.votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const held = accumulator.get(district) ?? { lat: 0, lng: 0, area: 0 };
  held.lat += record.centroid.lat * record.centroid.area;
  held.lng += record.centroid.lng * record.centroid.area;
  held.area += record.centroid.area;
  accumulator.set(district, held);
}
for (const [district, held] of accumulator) {
  if (!held.area) continue;
  labels[district] = {
    lat: Number((held.lat / held.area).toFixed(5)),
    lng: Number((held.lng / held.area).toFixed(5)),
  };
}

const output = { type: "FeatureCollection", labels, boundaries, features };
const json = `${JSON.stringify(output)}\n`;

console.log(`\n产出 ${features.length} 个分区多边形，丢弃 ${dropped} 个`);
console.log(`覆盖 D 区：${Object.keys(byDistrict).length}/28${missing.length ? `，缺 D${missing.join(", D")}` : "（齐全）"}`);
console.log(`推断归属的分区：${features.filter((f) => f.properties.inferred).length} 个`);
const straddling = features.filter((f) => f.properties.straddles);
console.log(`跨越多个 D 区的分区：${straddling.length} 个（按占多数的 D 区着色，界面会标注）`);
straddling.slice(0, 8).forEach((f) =>
  console.log(`   ${f.properties.subzone.padEnd(28)} D${f.properties.straddles.join(" / D")}`));
console.log(`标签点：${Object.keys(labels).length} 个`);
console.log(`邮区外轮廓：${boundaries.length} 条`);
console.log(`文件大小：${(json.length / 1024).toFixed(0)}KB`);

if (dryRun) console.log("\n--dry-run：未写入文件。");
else {
  await writeFile(dataUrl("districts.json"), json);
  console.log("\n已写入 public/data/districts.json");
}
