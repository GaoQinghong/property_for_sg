import { readFile, writeFile } from "node:fs/promises";
import { classifyProjectUse } from "./lib/project-use.mjs";

const file = new URL("../public/data/projects.json", import.meta.url);
const data = JSON.parse(await readFile(file, "utf8"));
data.projects = data.projects.map((project) => ({ ...project, ...classifyProjectUse(project) }));
await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
console.log(`已标注 ${data.projects.length} 个项目用途`);
