import { readFile, writeFile } from "node:fs/promises";

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
function validCoordinates(point) {
  return point && Number.isFinite(point.lat) && Number.isFinite(point.lng) && point.lat >= 1.13 && point.lat <= 1.49 && point.lng >= 103.59 && point.lng <= 104.12;
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
async function geocode(query) {
  const url = new URL("https://www.onemap.gov.sg/api/common/elastic/search");
  url.search = new URLSearchParams({ searchVal:query, returnGeom:"Y", getAddrDetails:"Y", pageNum:"1" });
  try {
    const result = await fetch(url, { headers:{ "User-Agent":"property_for_sg data updater" } }).then(r => r.json());
    const hit = result.results?.[0];
    return hit ? { lat:Number(hit.LATITUDE), lng:Number(hit.LONGITUDE) } : null;
  } catch { return null; }
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
  if (month && units > 0 && sold >= units) { audit.soldOut.push({name:row.project,units,sold}); continue; }
  let coordinates = validCoordinates({lat:Number(old.lat),lng:Number(old.lng)}) ? {lat:Number(old.lat),lng:Number(old.lng)} : null;
  if (!coordinates && sales?.x && sales?.y) coordinates = svy21ToWgs84(Number(sales.x), Number(sales.y));
  if (!coordinates) coordinates = await geocode(`${row.street || row.project}, Singapore`);
  let locationAccuracy="exact";
  if (!validCoordinates(coordinates)) {
    coordinates=districtFallback(row.project,row.district || sales?.district);
    locationAccuracy="district";
    audit.approximateCoordinates.push({name:row.project,district:row.district || sales?.district || "",source:"pipeline"});
  }
  merged.push({
    id:key.toLowerCase(), name:row.project, area:old.area || `${row.street || "新加坡"} · D${String(row.district || sales?.district || "—").padStart(2,"0")}`,
    status:month?.launchedToDate > 0 ? "在售" : (old.status === "即将开盘" ? "即将开盘" : "确定开发"), units, sold,
    developer:row.developerName || sales?.developer || old.developer || "待公布", tenure:old.tenure || "待公布", launch:old.launch || "尚未公布",
    top:row.expectedTOPYear && row.expectedTOPYear !== "na" ? String(row.expectedTOPYear) : (old.top || "待公布"), mrt:old.mrt || "待计算", school:old.school || "待计算",
    ...coordinates, locationAccuracy, updatedAt, source:"URA"
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
  let coordinates = validCoordinates({lat:Number(old.lat),lng:Number(old.lng)}) ? {lat:Number(old.lat),lng:Number(old.lng)} : null;
  if (!coordinates && sales.x && sales.y) coordinates = svy21ToWgs84(Number(sales.x), Number(sales.y));
  if (!coordinates) coordinates = await geocode(`${sales.street || sales.project}, Singapore`);
  let locationAccuracy="exact";
  if (!validCoordinates(coordinates)) {
    coordinates=districtFallback(sales.project,sales.district);
    locationAccuracy="district";
    audit.approximateCoordinates.push({name:sales.project,district:sales.district || "",source:"developer-sales"});
  }
  merged.push({
    id:key.toLowerCase(), name:sales.project, area:old.area || `${sales.street || "新加坡"} · D${String(sales.district || "—").padStart(2,"0")}`,
    status:launched > 0 ? "在售" : "确定开发", units, sold, developer:sales.developer || old.developer || "待公布", tenure:old.tenure || "待公布",
    launch:old.launch || (launched > 0 ? "已开盘" : "尚未公布"), top:old.top || "待公布", mrt:old.mrt || "待计算", school:old.school || "待计算",
    ...coordinates, locationAccuracy, updatedAt, source:"URA"
  });
}

for (const old of oldData.projects.filter(project => project.status === "土地供应" || project.source === "开发商资料")) {
  if (!merged.some(project => normalise(project.name) === normalise(old.name))) merged.push({...old, updatedAt});
}
const statusOrder = { "在售":0, "即将开盘":1, "确定开发":2, "土地供应":3 };
merged.sort((a,b) => statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name));
await writeFile(DATA_FILE, `${JSON.stringify({updatedAt, source:"URA developer sales, URA pipeline and GLS programme", projects:merged}, null, 2)}\n`);
await writeFile(new URL("../public/data/project-audit.json", import.meta.url), `${JSON.stringify({updatedAt,...audit}, null, 2)}\n`);
console.log(`已更新 ${merged.length} 个项目（${updatedAt}）`);
console.log(`审计：${audit.approximateCoordinates.length} 个使用区域级坐标，${audit.soldOut.length} 个已售罄，${audit.notLaunched.length} 个尚未开售，${audit.excludedNonResidential.length} 个非住宅项目已排除`);
