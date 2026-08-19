import { readFile, writeFile, mkdir } from "node:fs/promises";

function parseCsv(text) {
  const rows = []; let row = [], value = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i += 1; } else quoted = !quoted; }
    else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[i + 1] === "\n") i += 1; row.push(value); if (row.some(Boolean)) rows.push(row); row = []; value = ""; }
    else value += char;
  }
  const headers = rows.shift();
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

const normalize = value => value.toUpperCase().replace(/&/g, "AND").replace(/[^A-Z0-9]/g, "");
const locationOf = element => ({ lat: element.lat ?? element.center?.lat, lng: element.lon ?? element.center?.lon });
const moe = parseCsv(await readFile(process.argv[2] ?? "/tmp/moe_schools.csv", "utf8"));
const osm = JSON.parse(await readFile(process.argv[3] ?? "/tmp/sg_schools_malls.json", "utf8")).elements;
let overrides = [];
// The overrides file is optional — absent or malformed simply means no manual
// geocode corrections are applied.
try { overrides = JSON.parse(await readFile("public/data/school-geocode-overrides.json", "utf8")); } catch { overrides = []; }
const overridesByPostal = new Map(overrides.map(item => [item.postalCode, item]));
const osmSchools = osm.filter(item => item.tags?.amenity === "school" && item.tags?.name && locationOf(item).lat);
const byName = new Map();
for (const item of osmSchools) {
  const key = normalize(item.tags.name);
  if (!byName.has(key)) byName.set(key, item);
}

const schools = [];
const unmatched = [];
for (const record of moe) {
  const isPrimary = record.mainlevel_code === "PRIMARY";
  const isSecondary = record.mainlevel_code.startsWith("SECONDARY") || record.mainlevel_code.includes("MIXED");
  if (!isPrimary && !isSecondary) continue;
  const key = normalize(record.school_name);
  let match = byName.get(key);
  if (!match) match = osmSchools.find(item => item.tags?.["addr:postcode"] === record.postal_code);
  if (!match) match = osmSchools.find(item => {
    const candidate = normalize(item.tags.name);
    return key.length > 8 && candidate.length > 8 && (candidate.includes(key) || key.includes(candidate));
  });
  const override = overridesByPostal.get(record.postal_code);
  if (!match && !override) { unmatched.push({ name:record.school_name, postalCode:record.postal_code, address:record.address.trim(), type:isPrimary ? "小学" : "中学", level:record.mainlevel_code, nearestMrt:record.mrt_desc, bus:record.bus_desc, website:record.url_address }); continue; }
  const location = override ?? locationOf(match);
  schools.push({ name:record.school_name, type:isPrimary ? "小学" : "中学", level:record.mainlevel_code, address:record.address.trim(), postalCode:record.postal_code, nearestMrt:record.mrt_desc, bus:record.bus_desc, website:record.url_address, ...location });
}

const mallsByName = new Map();
for (const item of osm.filter(item => item.tags?.shop === "mall" && item.tags?.name && locationOf(item).lat)) {
  const key = normalize(item.tags.name);
  if (!mallsByName.has(key)) mallsByName.set(key, { name:item.tags.name, type:"商场", ...locationOf(item) });
}

await mkdir("public/data", { recursive:true });
await writeFile("public/data/schools.json", `${JSON.stringify(schools.sort((a,b) => a.name.localeCompare(b.name)), null, 2)}\n`);
await writeFile("public/data/malls.json", `${JSON.stringify([...mallsByName.values()].sort((a,b) => a.name.localeCompare(b.name)), null, 2)}\n`);
console.log(`Saved ${schools.length} MOE primary/secondary schools and ${mallsByName.size} malls.`);
if (unmatched.length) console.log(`Unmatched schools: ${JSON.stringify(unmatched)}`);
