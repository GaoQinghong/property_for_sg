/**
 * Shrinks public/data/mrt-lines.json for the browser.
 *
 * The raw OSM geometry carries sub-metre precision that no zoom level on the
 * site can show. Ramer–Douglas–Peucker at a few metres of tolerance plus
 * 5-decimal rounding (~1m) cuts the payload by roughly an order of magnitude
 * with no visible difference in the rendered lines.
 *
 *   node scripts/simplify-rail.mjs [--tolerance 8] [--dry-run]
 */
import { readFile, writeFile } from "node:fs/promises";

const DATA_FILE = new URL("../public/data/mrt-lines.json", import.meta.url);
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const toleranceIndex = args.indexOf("--tolerance");
const TOLERANCE_M = toleranceIndex >= 0 ? Number(args[toleranceIndex + 1]) : 8;

// Local flat-earth scaling is plenty inside Singapore's ~50km extent.
const METRES_PER_DEG_LAT = 110574;
const METRES_PER_DEG_LNG = 111320 * Math.cos((1.35 * Math.PI) / 180);
const toXY = ([lat, lng]) => [lng * METRES_PER_DEG_LNG, lat * METRES_PER_DEG_LAT];

function perpendicularDistance(point, start, end) {
  const [px, py] = toXY(point);
  const [sx, sy] = toXY(start);
  const [ex, ey] = toXY(end);
  const dx = ex - sx;
  const dy = ey - sy;
  if (dx === 0 && dy === 0) return Math.hypot(px - sx, py - sy);
  const t = ((px - sx) * dx + (py - sy) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (sx + clamped * dx), py - (sy + clamped * dy));
}

function simplify(points, tolerance) {
  if (points.length < 3) return points;
  let maxDistance = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (distance > maxDistance) { maxDistance = distance; index = i; }
  }
  if (maxDistance <= tolerance) return [points[0], points[points.length - 1]];
  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ];
}

const round = (value) => Number(value.toFixed(5));

const lines = JSON.parse(await readFile(DATA_FILE, "utf8"));
const before = lines.reduce((total, line) => total + line.segments.reduce((sum, seg) => sum + seg.length, 0), 0);

const simplified = lines.map((line) => ({
  ...line,
  segments: line.segments
    .map((segment) => simplify(segment, TOLERANCE_M).map(([lat, lng]) => [round(lat), round(lng)]))
    .filter((segment) => segment.length >= 2),
}));

const after = simplified.reduce((total, line) => total + line.segments.reduce((sum, seg) => sum + seg.length, 0), 0);
const output = `${JSON.stringify(simplified)}\n`;
const originalBytes = (await readFile(DATA_FILE)).length;

console.log(`容差 ${TOLERANCE_M}m：${before} → ${after} 个点（保留 ${((after / before) * 100).toFixed(1)}%）`);
console.log(`文件：${(originalBytes / 1024).toFixed(0)}KB → ${(output.length / 1024).toFixed(0)}KB`);

if (dryRun) console.log("--dry-run：未写入文件。");
else {
  await writeFile(DATA_FILE, output);
  console.log("已写入 public/data/mrt-lines.json");
}
