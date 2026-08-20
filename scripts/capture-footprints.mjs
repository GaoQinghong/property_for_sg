/**
 * Records every registered address point of each project.
 *
 * A large development spans several blocks with separate postal addresses, and
 * MOE's 1km priority radius is measured from the home's own address. The
 * Reserve Residences is 989m from Methodist Girls' Primary at 21 Jalan Anak
 * Bukit but 1083m at number 15 — a single stored point cannot express that, and
 * reporting either number alone tells some buyers the wrong thing.
 *
 *   node scripts/capture-footprints.mjs [--dry-run]
 */
import { readFile, writeFile } from "node:fs/promises";
import { distanceMetres, searchAddresses } from "./lib/geo.mjs";
import { enrichProjects } from "./lib/enrich.mjs";

const dataUrl = (name) => new URL(`../public/data/${name}`, import.meta.url);
const dryRun = process.argv.includes("--dry-run");

const readJson = async (name) => JSON.parse(await readFile(dataUrl(name), "utf8"));
const [data, stations, schools] = await Promise.all([
  readJson("projects.json"),
  readJson("mrt-stations.json"),
  readJson("schools.json"),
]);

const normalise = (value) => String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Points further than this from the stored pin are a different development. */
const MAX_SPREAD_M = 700;

let withMultiple = 0;

for (const project of data.projects) {
  const hits = await searchAddresses(project.name);
  const key = normalise(project.name);

  const points = hits
    // OneMap appends markers like "(U/C)"; match on the name it indexed.
    .filter((hit) => normalise(hit.label).includes(key) || key.includes(normalise(hit.label)))
    .filter((hit) => distanceMetres(project, hit) <= MAX_SPREAD_M)
    .map((hit) => ({ lat: Number(hit.lat.toFixed(6)), lng: Number(hit.lng.toFixed(6)) }));

  // De-duplicate blocks that share a coordinate.
  const unique = [];
  for (const point of points) {
    if (!unique.some((existing) => distanceMetres(existing, point) < 5)) unique.push(point);
  }

  if (unique.length > 1) {
    project.addressPoints = unique;
    withMultiple += 1;
    const spread = Math.max(...unique.map((a) => Math.max(...unique.map((b) => distanceMetres(a, b)))));
    console.log(`  ${project.name}：${unique.length} 个门牌点，跨度 ${Math.round(spread)}m`);
  } else {
    delete project.addressPoints;
  }
}

data.projects = enrichProjects(data.projects, { stations, schools });

const split = data.projects.filter((p) => p.schoolsWithin1kmPartial > 0);
console.log(`\n${withMultiple}/${data.projects.length} 个项目有多个门牌点。`);
console.log(`${split.length} 个项目处于 1km 临界（部分栋在范围内）：`);
split.forEach((p) => console.log(`   ${p.name}：确定 ${p.schoolsWithin1km} 所，部分栋另可及 ${p.schoolsWithin1kmPartial} 所`));

if (dryRun) console.log("\n--dry-run：未写入文件。");
else {
  await writeFile(dataUrl("projects.json"), `${JSON.stringify(data, null, 2)}\n`);
  console.log("\n已写入 public/data/projects.json");
}
