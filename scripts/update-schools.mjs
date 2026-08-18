import { readFile, writeFile, mkdir } from "node:fs/promises";

function parseCsv(text) {
  const rows = [];
  let row = [], value = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value); if (row.some(Boolean)) rows.push(row); row = []; value = "";
    } else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const headers = rows.shift();
  return rows.map(rowValues => Object.fromEntries(headers.map((header, index) => [header, rowValues[index] ?? ""])));
}

const sourcePath = process.argv[2] ?? "/tmp/moe_schools.csv";
const records = parseCsv(await readFile(sourcePath, "utf8")).filter(record =>
  record.mainlevel_code === "PRIMARY" || record.mainlevel_code.startsWith("SECONDARY") || record.mainlevel_code.includes("MIXED")
);
const output = new Array(records.length);
let cursor = 0;

async function geocode(record) {
  const query = new URLSearchParams({ searchVal: record.postal_code, returnGeom: "Y", getAddrDetails: "Y", pageNum: "1" });
  const headers = process.env.ONEMAP_TOKEN ? { Authorization: process.env.ONEMAP_TOKEN } : {};
  const response = await fetch(`https://www.onemap.gov.sg/api/common/elastic/search?${query}`, { headers });
  const payload = await response.json();
  const match = payload.results?.find(result => result.POSTAL === record.postal_code) ?? payload.results?.[0];
  if (!match?.LATITUDE || !match?.LONGITUDE) return null;
  return {
    name: record.school_name,
    type: record.mainlevel_code === "PRIMARY" ? "小学" : "中学",
    level: record.mainlevel_code,
    address: record.address.trim(),
    postalCode: record.postal_code,
    nearestMrt: record.mrt_desc,
    bus: record.bus_desc,
    website: record.url_address,
    lat: Number(match.LATITUDE),
    lng: Number(match.LONGITUDE),
  };
}

async function worker() {
  while (cursor < records.length) {
    const index = cursor++;
    try { output[index] = await geocode(records[index]); }
    catch { output[index] = null; }
  }
}

await Promise.all(Array.from({ length: 6 }, worker));
const schools = output.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
await mkdir("public/data", { recursive: true });
await writeFile("public/data/schools.json", `${JSON.stringify(schools, null, 2)}\n`);
console.log(`Saved ${schools.length}/${records.length} primary and secondary schools.`);
