import { mkdir, readFile, writeFile } from "node:fs/promises";

const source = process.argv[2];
if (!source) throw new Error("用法：node scripts/import-analysis-report.mjs <report.html>");
const html = await readFile(source, "utf8");
if (!/^<!doctype html>/i.test(html) || !html.includes("新加坡20年")) {
  throw new Error("输入文件不是预期的新加坡 20 年房产分析 HTML");
}
const directory = new URL("../public/reports/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL("singapore-property-20y.html", directory), html);
console.log(`已导入报告（${Math.round(html.length / 1024)}KB）`);
