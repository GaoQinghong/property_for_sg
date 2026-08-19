/**
 * Re-geocodes projects still sitting on a district-centre fallback pin and
 * recomputes their nearest-MRT / nearby-school facts.
 *
 * Safe to re-run: projects already located exactly are left untouched, so this
 * only ever upgrades district pins to real ones.
 *
 *   node scripts/backfill-locations.mjs [--dry-run]
 */
import { readFile, writeFile } from "node:fs/promises";
import { geocodeProject } from "./lib/geo.mjs";
import { enrichProjects } from "./lib/enrich.mjs";
import { findUnrepaired, repairMojibake } from "./lib/text.mjs";

const dataUrl = (name) => new URL(`../public/data/${name}`, import.meta.url);
const dryRun = process.argv.includes("--dry-run");

const readJson = async (name) => JSON.parse(await readFile(dataUrl(name), "utf8"));
const [data, stations, schools] = await Promise.all([
  readJson("projects.json"),
  readJson("mrt-stations.json"),
  readJson("schools.json"),
]);

// `area` looks like "99 STILL ROAD · D15"; the leading half is the street the
// updater captured from URA.
const streetOf = (project) => String(project.area || "").split(" · ")[0];

const stuck = data.projects.filter((project) => project.locationAccuracy !== "exact");
console.log(`${stuck.length} 个项目使用邮区中心兜底坐标，开始重新地理编码…`);

let upgraded = 0;
for (const project of stuck) {
  const point = await geocodeProject({ project: project.name, street: streetOf(project) });
  if (!point) {
    console.log(`  ✗ ${project.name} — OneMap 无结果，保留兜底坐标`);
    continue;
  }
  project.lat = point.lat;
  project.lng = point.lng;
  project.locationAccuracy = "exact";
  upgraded += 1;
  console.log(`  ✓ ${project.name} → ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`);
}

for (const project of data.projects) project.name = repairMojibake(project.name);
const stillMangled = findUnrepaired(data.projects.map((project) => project.name));
if (stillMangled.length) console.log(`\n⚠ 仍有乱码未修复：${stillMangled.join(", ")}`);

data.projects = enrichProjects(data.projects, { stations, schools });

const stillApproximate = data.projects.filter((project) => project.locationAccuracy !== "exact").length;
console.log(`\n升级 ${upgraded} 个项目为精确坐标，仍有 ${stillApproximate} 个待定位。`);
console.log(`已补全最近地铁与附近学校：${data.projects.filter((project) => project.mrt !== "待定位").length} 个项目。`);

if (dryRun) {
  console.log("\n--dry-run：未写入文件。");
} else {
  await writeFile(dataUrl("projects.json"), `${JSON.stringify(data, null, 2)}\n`);
  console.log("\n已写入 public/data/projects.json");
}
