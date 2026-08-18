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
function svy21ToWgs84(x, y) {
  const a=6378137, f=1/298.257223563, oLat=1.366666, oLon=103.833333, n0=38744.572, e0=28001.642, k=1;
  const e2=2*f-f*f, n=(a-Math.sqrt(a*a*(1-e2)))/(a+Math.sqrt(a*a*(1-e2))), G=a*(1-n)*(1-n*n)*(1+9*n*n/4+225*n**4/64)*(Math.PI/180);
  const Np=n0+(y-n0)/k, sigma=Np* Math.PI/(180*G), latPrime=sigma+(3*n/2-27*n**3/32)*Math.sin(2*sigma)+(21*n*n/16-55*n**4/32)*Math.sin(4*sigma)+(151*n**3/96)*Math.sin(6*sigma)+(1097*n**4/512)*Math.sin(8*sigma);
  const sin=Math.sin(latPrime), rho=a*(1-e2)/(1-e2*sin*sin)**1.5, v=a/Math.sqrt(1-e2*sin*sin), psi=v/rho, t=Math.tan(latPrime), E=(x-e0)/(k*v);
  const lat=latPrime-(t/(k*rho))*(E*E/2-(5+3*t*t+psi-9*t*t*psi)*E**4/24+(61+90*t*t+45*t**4)*E**6/720);
  const lon=oLon*Math.PI/180+(E-(1+2*t*t+psi)*E**3/6+(5+28*t*t+24*t**4)*E**5/120)/Math.cos(latPrime);
  return { lat:lat*180/Math.PI, lng:lon*180/Math.PI };
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

for (const row of pipelineRows) {
  const key = normalise(row.project);
  const old = oldByName.get(key) || {};
  const sales = salesByName.get(key);
  const month = sales && latestSales(sales);
  const units = Number(month?.unitsAvail || row.totalUnits || 0);
  const sold = Number(month?.soldToDate || 0);
  if (month && units > 0 && sold >= units) continue;
  let coordinates = old.lat && old.lng ? {lat:old.lat,lng:old.lng} : null;
  if (!coordinates && sales?.x && sales?.y) coordinates = svy21ToWgs84(Number(sales.x), Number(sales.y));
  if (!coordinates) coordinates = await geocode(`${row.street || row.project}, Singapore`);
  if (!coordinates) continue;
  merged.push({
    id:key.toLowerCase(), name:row.project, area:old.area || `${row.street || "新加坡"} · D${String(row.district || sales?.district || "—").padStart(2,"0")}`,
    status:month?.launchedToDate > 0 ? "在售" : (old.status === "即将开盘" ? "即将开盘" : "确定开发"), units, sold,
    developer:row.developerName || sales?.developer || old.developer || "待公布", tenure:old.tenure || "待公布", launch:old.launch || "尚未公布",
    top:row.expectedTOPYear && row.expectedTOPYear !== "na" ? String(row.expectedTOPYear) : (old.top || "待公布"), mrt:old.mrt || "待计算", school:old.school || "待计算",
    ...coordinates, updatedAt, source:"URA"
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
  if (!units || sold >= units || Number(month?.launchedToDate || 0) === 0) continue;
  const old = oldByName.get(key) || {};
  let coordinates = old.lat && old.lng ? {lat:old.lat,lng:old.lng} : null;
  if (!coordinates && sales.x && sales.y) coordinates = svy21ToWgs84(Number(sales.x), Number(sales.y));
  if (!coordinates) coordinates = await geocode(`${sales.street || sales.project}, Singapore`);
  if (!coordinates) continue;
  merged.push({
    id:key.toLowerCase(), name:sales.project, area:old.area || `${sales.street || "新加坡"} · D${String(sales.district || "—").padStart(2,"0")}`,
    status:"在售", units, sold, developer:sales.developer || old.developer || "待公布", tenure:old.tenure || "待公布",
    launch:old.launch || "已开盘", top:old.top || "待公布", mrt:old.mrt || "待计算", school:old.school || "待计算",
    ...coordinates, updatedAt, source:"URA"
  });
}

for (const old of oldData.projects.filter(project => project.status === "土地供应")) merged.push({...old, updatedAt});
const statusOrder = { "在售":0, "即将开盘":1, "确定开发":2, "土地供应":3 };
merged.sort((a,b) => statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name));
await writeFile(DATA_FILE, `${JSON.stringify({updatedAt, source:"URA developer sales, URA pipeline and GLS programme", projects:merged}, null, 2)}\n`);
console.log(`已更新 ${merged.length} 个项目（${updatedAt}）`);
