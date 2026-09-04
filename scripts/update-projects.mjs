import { readFile, writeFile } from "node:fs/promises";
import { distanceMetres, geocodeProject, validCoordinates } from "./lib/geo.mjs";
import { enrichProjects } from "./lib/enrich.mjs";
import { findUnrepaired, repairMojibake } from "./lib/text.mjs";
import { classifyProjectUse } from "./lib/project-use.mjs";
import { classifyHousingType } from "./lib/housing-type.mjs";
import { tenureFromApi } from "./lib/tenure.mjs";

const DATA_FILE = new URL("../public/data/projects.json", import.meta.url);
const accessKey = process.env.URA_ACCESS_KEY;
if (!accessKey) throw new Error("缺少 URA_ACCESS_KEY；请在 GitHub Actions secrets 中配置 URA 官方 API Access Key。");

const today = new Date();
const updatedAt = today.toISOString().slice(0, 10);
// URA publishes a month's developer-sales figures on the 15th of the following month.
const latestPublishedMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
const oldData = JSON.parse(await readFile(DATA_FILE, "utf8"));
const oldByName = new Map(oldData.projects.map(project => [normalise(project.name), project]));

const tokenResponse = await fetch("https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1", { headers: { AccessKey: accessKey } });
if (!tokenResponse.ok) throw new Error(`URA token 请求失败：${tokenResponse.status}`);
const tokenPayload = await tokenResponse.json();
if (tokenPayload.Status !== "Success" || !tokenPayload.Result) throw new Error(`URA token: ${tokenPayload.Message || tokenPayload.Status}`);
const token = tokenPayload.Result;

async function ura(service, extra = "") {
  const response = await fetch(`https://eservice.ura.gov.sg/uraDataService/invokeUraDS/v1?service=${service}${extra}`, { headers: { AccessKey: accessKey, Token: token } });
  if (!response.ok) throw new Error(`URA ${service} 请求失败：${response.status}`);
  const payload = await response.json();
  if (payload.Status !== "Success") throw new Error(`URA ${service}: ${payload.Message || payload.Status}`);
  return payload.Result || [];
}

function normalise(value = "") { return value.toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function periodValue(value = "") { const month=Number(value.slice(0,2)), year=2000+Number(value.slice(2,4)); return year*12+month; }
function latestSales(record) {
  return [...(record.developerSales || [])].sort((a, b) => periodValue(b.refPeriod)-periodValue(a.refPeriod))[0];
}
/**
 * Reuse a previously stored position only when it was an exact fix. District
 * fallbacks land inside Singapore too, so accepting any in-bounds coordinate
 * pinned every fallback permanently and stopped it ever being re-geocoded.
 */
function reusableCoordinates(old) {
  if (old.locationAccuracy !== "exact") return null;
  const point = { lat: Number(old.lat), lng: Number(old.lng) };
  return validCoordinates(point) ? point : null;
}
/**
 * Per-block address points come from `scripts/capture-footprints.mjs`, not from
 * URA, so carry them across a refresh — but only while the project has not
 * moved, since a re-geocode invalidates the whole footprint.
 */
function carriedOver(old, coordinates) {
  if (!old.addressPoints?.length || !coordinates) return {};
  const moved = distanceMetres({ lat: Number(old.lat), lng: Number(old.lng) }, coordinates);
  return Number.isFinite(moved) && moved < 50 ? { addressPoints: old.addressPoints } : {};
}
function svy21ToWgs84(x, y) {
  // SVY21 is locally almost linear across Singapore. This local tangent-plane
  // conversion is accurate enough for map pins and avoids the broken inverse
  // projection previously placing otherwise valid projects outside Singapore.
  const originLat=1.3666666667, originLng=103.8333333333, northing0=38744.572, easting0=28001.642;
  const lat=originLat+(y-northing0)/110574;
  const lng=originLng+(x-easting0)/(111320*Math.cos(originLat*Math.PI/180));
  const point={lat,lng};
  return validCoordinates(point) ? point : null;
}

const districtCentres = {
  1:[1.282,103.852],2:[1.276,103.839],3:[1.289,103.817],4:[1.268,103.808],5:[1.304,103.783],6:[1.296,103.852],
  7:[1.301,103.857],8:[1.313,103.855],9:[1.304,103.829],10:[1.316,103.807],11:[1.326,103.841],12:[1.326,103.861],
  13:[1.341,103.872],14:[1.316,103.889],15:[1.306,103.912],16:[1.325,103.936],17:[1.357,103.965],18:[1.355,103.942],
  19:[1.372,103.896],20:[1.354,103.837],21:[1.338,103.779],22:[1.340,103.706],23:[1.378,103.752],24:[1.385,103.695],
  25:[1.438,103.786],26:[1.405,103.812],27:[1.423,103.837],28:[1.388,103.872]
};
function districtFallback(name, district) {
  const centre=districtCentres[Number(district)] || [1.3521,103.8198];
  let hash=0; for (const char of name) hash=(hash*31+char.charCodeAt(0))>>>0;
  return {lat:centre[0]+((hash%101)-50)/10000,lng:centre[1]+(((hash>>>8)%101)-50)/10000};
}
function excludedNonResidential(name="") {
  const value=name.toLowerCase();
  return value.includes("service apartment") || value.includes("serviced apartment") || value.includes("hotel development") || value === "office/retail development";
}

const periods = Array.from({length:36}, (_, offset) => {
  const date = new Date(Date.UTC(latestPublishedMonth.getUTCFullYear(), latestPublishedMonth.getUTCMonth() - (35-offset), 1));
  return `${String(date.getUTCMonth()+1).padStart(2,"0")}${String(date.getUTCFullYear()).slice(-2)}`;
});
const pipelineRows = await ura("PMI_Resi_Pipeline");
const salesByName = new Map();
for (let index=0; index<periods.length; index+=4) {
  const rows = (await Promise.all(periods.slice(index,index+4).map(period => ura("PMI_Resi_Developer_Sales", `&refPeriod=${period}`)))).flat();
  for (const row of rows) {
    const key = normalise(row.project), previous = salesByName.get(key);
    if (!previous || periodValue(latestSales(row)?.refPeriod) >= periodValue(latestSales(previous)?.refPeriod)) salesByName.set(key,row);
  }
}
const merged = [];
const mergedKeys = new Set();
const audit = { soldOut:[], approximateCoordinates:[], excludedNonResidential:[], notLaunched:[] };

for (const row of pipelineRows) {
  const key = normalise(row.project);
  if (mergedKeys.has(key)) continue;
  if (excludedNonResidential(row.project)) { audit.excludedNonResidential.push({name:row.project}); continue; }
  const old = oldByName.get(key) || {};
  const sales = salesByName.get(key);
  const month = sales && latestSales(sales);
  const units = Number(month?.unitsAvail || row.totalUnits || 0);
  const sold = Number(month?.soldToDate || 0);
  const soldOut = Boolean(month && units > 0 && sold >= units);
  if (soldOut) audit.soldOut.push({name:row.project,units,sold});
  let coordinates = reusableCoordinates(old);
  if (!coordinates && sales?.x && sales?.y) coordinates = svy21ToWgs84(Number(sales.x), Number(sales.y));
  if (!coordinates) coordinates = await geocodeProject({ project: row.project, street: row.street });
  let locationAccuracy="exact";
  if (!validCoordinates(coordinates)) {
    coordinates=districtFallback(row.project,row.district || sales?.district);
    locationAccuracy="district";
    audit.approximateCoordinates.push({name:row.project,district:row.district || sales?.district || "",source:"pipeline"});
  }
  merged.push({
    id:key.toLowerCase(), name:row.project, area:old.area || `${row.street || "新加坡"} · D${String(row.district || sales?.district || "—").padStart(2,"0")}`,
    status:soldOut ? "售罄" : (month?.launchedToDate > 0 ? "在售" : (old.status === "即将开盘" ? "即将开盘" : "确定开发")), units, sold,
    developer:row.developerName || sales?.developer || old.developer || "待公布", ...tenureFromApi(old, row, sales, month), launch:old.launch || "尚未公布",
    top:row.expectedTOPYear && row.expectedTOPYear !== "na" ? String(row.expectedTOPYear) : (old.top || "待公布"),
    ...coordinates, ...carriedOver(old, coordinates), locationAccuracy, updatedAt, source:"URA"
  });
  mergedKeys.add(key);
}

// URA's public pipeline list excludes non-landed projects below 200 units and
// landed projects below 15 units. Developer-sales data has no such size floor,
// so add every smaller project that still has unsold developer inventory.
for (const [key, sales] of salesByName) {
  if (mergedKeys.has(key)) continue;
  const month = latestSales(sales);
  const units = Number(month?.unitsAvail || 0), sold = Number(month?.soldToDate || 0);
  if (!units || sold >= units) continue;
  if (excludedNonResidential(sales.project)) { audit.excludedNonResidential.push({name:sales.project}); continue; }
  const launched=Number(month?.launchedToDate || 0);
  if (launched === 0) audit.notLaunched.push({name:sales.project,units,sold});
  const old = oldByName.get(key) || {};
  let coordinates = reusableCoordinates(old);
  if (!coordinates && sales.x && sales.y) coordinates = svy21ToWgs84(Number(sales.x), Number(sales.y));
  if (!coordinates) coordinates = await geocodeProject({ project: sales.project, street: sales.street });
  let locationAccuracy="exact";
  if (!validCoordinates(coordinates)) {
    coordinates=districtFallback(sales.project,sales.district);
    locationAccuracy="district";
    audit.approximateCoordinates.push({name:sales.project,district:sales.district || "",source:"developer-sales"});
  }
  merged.push({
    id:key.toLowerCase(), name:sales.project, area:old.area || `${sales.street || "新加坡"} · D${String(sales.district || "—").padStart(2,"0")}`,
    status:launched > 0 ? "在售" : "确定开发", units, sold, developer:sales.developer || old.developer || "待公布", ...tenureFromApi(old, sales, month),
    launch:old.launch || (launched > 0 ? "已开盘" : "尚未公布"), top:old.top || "待公布",
    ...coordinates, ...carriedOver(old, coordinates), locationAccuracy, updatedAt, source:"URA"
  });
}

for (const old of oldData.projects.filter(project => project.status === "土地供应" || project.source === "开发商资料")) {
  if (!merged.some(project => normalise(project.name) === normalise(old.name))) merged.push({...old, updatedAt});
}
const statusOrder = { "在售":0, "售罄":1, "即将开盘":2, "确定开发":3, "土地供应":4 };
merged.sort((a,b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99) || a.name.localeCompare(b.name));

for (const project of merged) project.name = repairMojibake(project.name);
const stillMangled = findUnrepaired(merged.map(project => project.name));
if (stillMangled.length) console.warn(`⚠ URA 返回的名称仍有乱码：${stillMangled.join(", ")}`);

// Derive nearest-MRT and nearby-school facts from the reference datasets that
// already ship with the site, so the detail card never shows a placeholder for
// a project we do have an exact position for.
const [stations, schools] = await Promise.all([
  readFile(new URL("../public/data/mrt-stations.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../public/data/schools.json", import.meta.url), "utf8").then(JSON.parse),
]);
const enriched = enrichProjects(merged, { stations, schools }).map(project => ({
  ...project,
  ...classifyProjectUse(project),
  ...classifyHousingType(project),
}));

await writeFile(DATA_FILE, `${JSON.stringify({updatedAt, source:"URA developer sales, URA pipeline and GLS programme", projects:enriched}, null, 2)}\n`);
await writeFile(new URL("../public/data/project-audit.json", import.meta.url), `${JSON.stringify({updatedAt,...audit}, null, 2)}\n`);
console.log(`已更新 ${merged.length} 个项目（${updatedAt}）`);
console.log(`审计：${audit.approximateCoordinates.length} 个使用区域级坐标，${audit.soldOut.length} 个已售罄，${audit.notLaunched.length} 个尚未开售，${audit.excludedNonResidential.length} 个非住宅项目已排除`);
