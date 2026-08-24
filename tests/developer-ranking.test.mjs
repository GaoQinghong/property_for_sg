import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { before } from "node:test";
import * as esbuild from "esbuild";

const root = new URL("../", import.meta.url);
const readData = async (name) => JSON.parse(await readFile(new URL(`public/data/${name}`, root), "utf8"));

let buildDeveloperRanking;
let projects;
let directory;

before(async () => {
  [projects, directory] = await Promise.all([readData("projects.json"), readData("developers.json")]);
  const result = await esbuild.build({
    entryPoints: [new URL("app/developerRanking.ts", root).pathname],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  const url = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`;
  ({ buildDeveloperRanking } = await import(url));
});

test("开发商排名覆盖全部已核验集团且顺序连续", () => {
  const ranking = buildDeveloperRanking(projects.projects, directory);
  assert.equal(ranking.length, Object.keys(directory.groups).length);
  assert.deepEqual(ranking.map((developer) => developer.rank), ranking.map((_, index) => index + 1));
  for (let index = 1; index < ranking.length; index += 1) {
    assert.ok(ranking[index - 1].score >= ranking[index].score, "综合分应由高到低排列");
  }
  assert.ok(ranking.every((developer) => developer.score >= 0 && developer.score <= 100));
});

test("当前楼盘会补入 TOP、户数和产权，不用历史目录猜测", () => {
  const ranking = buildDeveloperRanking(projects.projects, directory);
  const uol = ranking.find((developer) => developer.key === "uol");
  const upperhouse = uol.portfolio.find((project) => /upperhouse/i.test(project.name));
  assert.ok(upperhouse, "UOL 应列出 Upperhouse");
  assert.equal(upperhouse.units, 301);
  assert.equal(upperhouse.top, "2029");
  assert.equal(upperhouse.tenure, "99 年（自 2024 年起）");
  assert.equal(upperhouse.status, "在售");
});

test("合资项目只在规模指标中按集团数均分", () => {
  const ranking = buildDeveloperRanking(projects.projects, directory);
  const parktown = projects.projects.find((project) => /parktown/i.test(project.name));
  const owners = ranking.filter((developer) => developer.activeProjectIds.includes(String(parktown.id)));
  assert.ok(owners.length > 1, "Parktown 应归属多个合资集团");
  for (const owner of owners) {
    assert.ok(owner.portfolio.some((project) => /parktown/i.test(project.name)), "每个参与集团都应列出完整项目");
  }
});

test("历史资料缺失时保留 null，页面可明确显示待核实", () => {
  const ranking = buildDeveloperRanking(projects.projects, directory);
  const historical = ranking.flatMap((developer) => developer.portfolio)
    .find((project) => project.status === "历史项目" && project.units === null);
  assert.ok(historical, "应存在尚未补齐户数的历史项目");
  assert.equal(historical.units, null);
});

test("有明确资料来源时优先使用已核验日期口径", () => {
  const ranking = buildDeveloperRanking(projects.projects, directory);
  const bukit = ranking.find((developer) => developer.key === "bukit-sembawang");
  const project = bukit.portfolio.find((entry) => entry.name === "8@BT");
  assert.equal(project.top, "2027 Q4");
  assert.equal(project.yearType, "estimated_top");
  assert.match(project.sourceUrl, /bukitsembawang\.sg/);
});
