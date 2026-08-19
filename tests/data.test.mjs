/**
 * Guards the shape and the honesty of the published data files. These replace
 * the starter template's tests, which asserted against a loading skeleton the
 * site stopped rendering long ago.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { distanceMetres, validCoordinates } from "../scripts/lib/geo.mjs";
import { enrichProject } from "../scripts/lib/enrich.mjs";
import { repairMojibake } from "../scripts/lib/text.mjs";

const readData = async (name) =>
  JSON.parse(await readFile(new URL(`../public/data/${name}`, import.meta.url), "utf8"));

const STATUSES = new Set(["在售", "即将开盘", "确定开发", "土地供应"]);

test("每个项目都有渲染所需的字段且坐标在新加坡境内", async () => {
  const { projects } = await readData("projects.json");
  assert.ok(projects.length > 50, "项目数量异常偏少");

  for (const project of projects) {
    assert.ok(project.id, `${project.name} 缺少 id`);
    assert.ok(project.name, "存在无名项目");
    assert.ok(STATUSES.has(project.status), `${project.name} 状态非法：${project.status}`);
    assert.ok(Number.isFinite(project.units) && project.units >= 0, `${project.name} 户数非法`);
    assert.ok(project.sold <= project.units, `${project.name} 已售数超过总户数`);
    assert.ok(validCoordinates(project), `${project.name} 坐标不在新加坡境内`);
  }
});

test("项目 id 唯一", async () => {
  const { projects } = await readData("projects.json");
  const ids = projects.map((project) => String(project.id));
  assert.equal(new Set(ids).size, ids.length, "存在重复的项目 id");
});

test("名称不含未修复的乱码", async () => {
  const { projects } = await readData("projects.json");
  const mangled = projects.filter((project) => project.name.includes("�"));
  assert.deepEqual(mangled.map((project) => project.name), []);
});

test("只有精确定位的项目才带距离数据", async () => {
  const { projects } = await readData("projects.json");
  for (const project of projects) {
    if (project.locationAccuracy === "exact") continue;
    assert.equal(project.mrt, "待定位", `${project.name} 用估算坐标给出了地铁距离`);
    assert.equal(project.school, "待定位", `${project.name} 用估算坐标给出了学校距离`);
  }
});

test("精确定位的项目都补全了地铁与学校", async () => {
  const { projects } = await readData("projects.json");
  const exact = projects.filter((project) => project.locationAccuracy === "exact");
  const missing = exact.filter((project) => project.mrt === "待定位" || project.school === "待定位");
  assert.deepEqual(missing.map((project) => project.name), []);
});

test("enrichProject 拒绝为估算坐标编造距离", () => {
  const stations = [{ name: "Newton", ref: "NS21", lat: 1.3138, lng: 103.8384, station: "subway", status: "operating" }];
  const schools = [{ name: "TEST PRIMARY", type: "小学", lat: 1.3140, lng: 103.8390 }];
  const approximate = enrichProject(
    { name: "X", lat: 1.3138, lng: 103.8384, locationAccuracy: "district" },
    { stations, schools },
  );
  assert.equal(approximate.mrt, "待定位");
  assert.equal(approximate.schoolsWithin1km, null);

  const exact = enrichProject(
    { name: "Y", lat: 1.3138, lng: 103.8384, locationAccuracy: "exact" },
    { stations, schools },
  );
  assert.match(exact.mrt, /^Newton · \d+m$/);
  assert.equal(exact.schoolsWithin1km, 1);
});

test("distanceMetres 与已知距离吻合", () => {
  // Raffles Place to City Hall is roughly 650m apart.
  const metres = distanceMetres({ lat: 1.2830, lng: 103.8513 }, { lat: 1.2931, lng: 103.8520 });
  assert.ok(metres > 1000 && metres < 1300, `实测 ${Math.round(metres)}m`);
});

test("repairMojibake 修复 URA 的编码破损", () => {
  assert.equal(repairMojibake("J�€?den"), "J’den");
  assert.equal(repairMojibake("VERD�‰ JOO CHIAT"), "VERDÉ JOO CHIAT");
  assert.equal(repairMojibake("NORMAL NAME"), "NORMAL NAME");
});

test("参考数据集完整可用", async () => {
  const [stations, schools, malls, lines] = await Promise.all(
    ["mrt-stations.json", "schools.json", "malls.json", "mrt-lines.json"].map(readData),
  );
  assert.ok(stations.length > 200 && stations.every(validCoordinates));
  assert.ok(schools.length > 300 && schools.every(validCoordinates));
  assert.ok(malls.length > 200 && malls.every(validCoordinates));
  assert.ok(lines.length > 10);
  for (const line of lines) {
    assert.ok(line.segments.every((segment) => segment.length >= 2), `${line.ref} 存在退化线段`);
  }
});
