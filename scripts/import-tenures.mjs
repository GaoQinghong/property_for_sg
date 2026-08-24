import { readFile, writeFile } from "node:fs/promises";
import { formatTenure, URA_TRANSACTION_SOURCE } from "./lib/tenure.mjs";

const sourceFiles = process.argv.slice(2);
if (!sourceFiles.length) throw new Error("用法：node scripts/import-tenures.mjs <URA transaction JSON> [...]");

const normalise = (value = "") => value.toUpperCase()
  .replace(/&(?:#0?39|APOS);/g, "'")
  .replace(/[^A-Z0-9]/g, "");
const tenures = new Map();
for (const sourceFile of sourceFiles) {
  const batches = JSON.parse(await readFile(sourceFile, "utf8"));
  for (const rows of Object.values(batches)) {
    for (const [name, record] of Object.entries(rows)) {
      if (record.tenure) tenures.set(normalise(name), record.tenure);
    }
  }
}

const file = new URL("../public/data/projects.json", import.meta.url);
const data = JSON.parse(await readFile(file, "utf8"));
let matched = 0;
data.projects = data.projects.map((project) => {
  const raw = tenures.get(normalise(project.name));
  if (raw) {
    matched += 1;
    return { ...project, tenure: formatTenure(raw), tenureBasis: "verified", tenureSource: URA_TRANSACTION_SOURCE };
  }
  if (project.tenure && project.tenure !== "待公布") {
    return { ...project, tenure: formatTenure(project.tenure), tenureBasis: project.tenureBasis || "verified" };
  }
  return { ...project, tenure: "待公布", tenureBasis: "pending" };
});
await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
console.log(`URA 成交记录匹配 ${matched}/${data.projects.length} 个项目`);
