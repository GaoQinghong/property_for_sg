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

test("每个项目都有可追溯的用途分类", async () => {
  const { projects } = await readData("projects.json");
  for (const project of projects) {
    assert.ok(["residential", "mixed"].includes(project.useType), `${project.name} 缺少用途分类`);
    assert.ok(["verified", "inferred"].includes(project.useBasis), `${project.name} 缺少分类依据`);
    assert.match(project.useSource || "", /^https:\/\//, `${project.name} 缺少用途来源`);
  }
  assert.ok(projects.some((project) => project.useType === "mixed"), "未识别出商住一体项目");
});

test("每个项目都标注产权且官方成交产权可追溯", async () => {
  const { projects } = await readData("projects.json");
  for (const project of projects) {
    assert.ok(project.tenure, `${project.name} 缺少产权`);
    assert.ok(["verified", "pending"].includes(project.tenureBasis), `${project.name} 缺少产权核验状态`);
    if (project.tenureBasis === "pending") assert.equal(project.tenure, "待公布", `${project.name} 待核产权不应猜测`);
    if (project.tenureSource) assert.match(project.tenureSource, /^https:\/\//, `${project.name} 产权来源非法`);
  }
  assert.ok(projects.filter((project) => project.tenureBasis === "verified").length > 100, "已核验产权覆盖率异常偏低");
  assert.equal(projects.find((project) => project.name === "The Continuum")?.tenure, "永久产权");
});

test("邮区数据包含 28 条独立外轮廓", async () => {
  const districts = await readData("districts.json");
  assert.equal(districts.boundaries?.length, 28, "邮区外轮廓应覆盖 D01–D28");
  assert.deepEqual(
    [...districts.boundaries.map((feature) => feature.properties.district)].sort((a, b) => a - b),
    Array.from({ length: 28 }, (_, index) => index + 1),
  );
});

test("URA 市场区边界完整覆盖 CCR、RCR、OCR", async () => {
  const regions = await readData("market-regions.json");
  assert.deepEqual(regions.features.map((feature) => feature.properties.segment).sort(), ["CCR", "OCR", "RCR"]);
  assert.deepEqual(Object.keys(regions.labels).sort(), ["CCR", "OCR", "RCR"]);
  for (const feature of regions.features) {
    assert.equal(feature.geometry.type, "MultiPolygon");
    assert.ok(feature.geometry.coordinates.length > 0, `${feature.properties.segment} 边界为空`);
  }
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

test("多门牌楼盘按每个门牌点判定 1km 优先权", () => {
  const stations = [{ name: "S", ref: "X1", lat: 1.3, lng: 103.8, station: "subway", status: "operating" }];
  // Two blocks 400m apart; the school sits 900m from one and 1.3km from the other.
  const schools = [{ name: "SPLIT PRIMARY", type: "小学", lat: 1.3, lng: 103.79191 }];
  const project = {
    name: "Z",
    lat: 1.3,
    lng: 103.8,
    locationAccuracy: "exact",
    addressPoints: [{ lat: 1.3, lng: 103.8 }, { lat: 1.3, lng: 103.80360 }],
  };
  const result = enrichProject(project, { stations, schools });
  assert.equal(result.schoolsWithin1km, 0, "并非所有门牌都在 1km 内，不应计入");
  assert.equal(result.schoolsWithin1kmPartial, 1, "应标注为部分栋可及");

  // The same school against a single-point project inside the radius.
  const single = enrichProject(
    { name: "Y", lat: 1.3, lng: 103.8, locationAccuracy: "exact" },
    { stations, schools },
  );
  assert.equal(single.schoolsWithin1km, 1);
  assert.equal(single.schoolsWithin1kmPartial, 0);
});

test("门牌点都落在项目附近且无重复", async () => {
  const { projects } = await readData("projects.json");
  const multi = projects.filter((project) => project.addressPoints?.length);
  assert.ok(multi.length > 10, `仅 ${multi.length} 个项目记录了门牌点`);
  for (const project of multi) {
    assert.ok(project.addressPoints.length > 1, `${project.name} 只有一个门牌点却存了数组`);
    for (const point of project.addressPoints) {
      assert.ok(validCoordinates(point), `${project.name} 门牌点越界`);
      const away = distanceMetres(project, point);
      assert.ok(away <= 1000, `${project.name} 门牌点距主坐标 ${Math.round(away)}m，疑似匹配到别的楼盘`);
    }
  }
});

test("临界项目同时给出确定与部分栋两个口径", async () => {
  const { projects } = await readData("projects.json");
  for (const project of projects) {
    if (project.locationAccuracy !== "exact") continue;
    assert.equal(typeof project.schoolsWithin1km, "number", `${project.name} 缺少 schoolsWithin1km`);
    assert.equal(typeof project.schoolsWithin1kmPartial, "number", `${project.name} 缺少 schoolsWithin1kmPartial`);
    // A single-address project can never straddle the radius.
    if (!project.addressPoints) {
      assert.equal(project.schoolsWithin1kmPartial, 0,
        `${project.name} 只有一个门牌却标了部分栋可及`);
    }
  }
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
