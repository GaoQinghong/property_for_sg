/**
 * Mounts the real page component in jsdom with Leaflet stubbed out, so the
 * data-to-UI wiring is covered without a browser.
 *
 * This exists because a stale `useMemo` dependency array once shipped a build
 * that rendered six hard-coded sample projects instead of the fetched data,
 * and nothing in the pipeline noticed.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { before } from "node:test";
import { JSDOM } from "jsdom";
import * as esbuild from "esbuild";

const projectRoot = new URL("../", import.meta.url);
const readData = async (name) =>
  JSON.parse(await readFile(new URL(`public/data/${name}`, projectRoot), "utf8"));

/** Minimal Leaflet stand-in: records calls, renders nothing. */
const leafletStub = `
const noop = () => stub;
const stub = new Proxy(function () {}, {
  get: (target, key) => {
    if (key === "then") return undefined;
    if (key === "getElement") return () => ({ classList: { toggle() {} } });
    if (key === "getZoom") return () => 11;
    if (key === "getBounds") return () => ({ pad: () => ({ contains: () => true }) });
    return stub;
  },
  apply: () => stub,
});
export default stub;
`;

let bundle;
let projects;

before(async () => {
  projects = await readData("projects.json");
  const result = await esbuild.build({
    entryPoints: [new URL("tests/fixtures/mount.tsx", projectRoot).pathname],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    jsx: "automatic",
    loader: { ".css": "empty" },
    plugins: [{
      name: "stub-leaflet",
      setup(build) {
        build.onResolve({ filter: /^leaflet$/ }, () => ({ path: "leaflet", namespace: "stub" }));
        build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: leafletStub, loader: "js" }));
      },
    }],
  });
  bundle = result.outputFiles[0].text;
});

async function mount() {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "http://localhost/property_for_sg/",
    pretendToBeVisual: true,
    // Needed so `window.eval` evaluates the bundle inside the jsdom realm.
    runScripts: "outside-only",
  });
  const { window } = dom;

  const files = {
    "projects.json": projects,
    "developers.json": await readData("developers.json"),
    "mrt-lines.json": await readData("mrt-lines.json"),
    "mrt-stations.json": await readData("mrt-stations.json"),
    "schools.json": await readData("schools.json"),
    "malls.json": await readData("malls.json"),
    "districts.json": await readData("districts.json"),
  };
  const requested = [];
  window.fetch = async (input) => {
    const name = String(input).split("/").pop();
    requested.push(name);
    if (!(name in files)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => files[name] };
  };
  window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  window.HTMLDialogElement.prototype.close = function close() { this.open = false; };

  // jsdom does not execute module scripts, so evaluate the bundle directly.
  window.eval(bundle.replace(/^export\s*\{[^}]*\};?$/m, ""));

  // Let the fetch microtasks and React effects flush.
  for (let i = 0; i < 12; i += 1) await new Promise((resolve) => window.setTimeout(resolve, 0));

  return { window, document: window.document, requested };
}

test("渲染真实数据而非内置后备数据", async () => {
  const { document } = await mount();
  const cards = document.querySelectorAll(".project-card");
  assert.equal(cards.length, projects.projects.length,
    `应渲染 ${projects.projects.length} 个项目，实际 ${cards.length} 个`);
  assert.match(document.querySelector(".results-head").textContent, new RegExp(`${projects.projects.length}`));
});

test("状态筛选会缩小结果集", async () => {
  const { window, document } = await mount();
  const onSale = projects.projects.filter((project) => project.status === "在售").length;
  const tab = [...document.querySelectorAll(".status-tabs button")].find((button) => button.textContent === "在售");
  tab.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  assert.equal(document.querySelectorAll(".project-card").length, onSale);
});

test("学校与商场数据在图层开启前不会下载", async () => {
  const { requested } = await mount();
  assert.ok(requested.includes("projects.json"), "项目数据应立即加载");
  assert.ok(!requested.includes("schools.json"), "学校数据不应在默认状态下加载");
  assert.ok(!requested.includes("malls.json"), "商场数据不应在默认状态下加载");
});

test("详情卡片在选中项目后出现", async () => {
  const { window, document } = await mount();
  assert.equal(document.querySelector(".detail-card"), null, "未选中时不应有详情卡片");
  document.querySelector(".project-card").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  assert.ok(document.querySelector(".detail-card"), "选中后应出现详情卡片");
});

test("筛选掉已选项目会连带关闭详情卡片", async () => {
  const { window, document } = await mount();
  document.querySelector(".project-card").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  assert.ok(document.querySelector(".detail-card"));

  const input = document.querySelector("#search");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, "绝不匹配任何项目的关键词");
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await new Promise((resolve) => window.setTimeout(resolve, 0));

  assert.equal(document.querySelectorAll(".project-card").length, 0);
  assert.equal(document.querySelector(".detail-card"), null, "详情卡片应随筛选一起关闭");
});

test("详情卡片展示邮区、开发商集团与历史楼盘", async () => {
  const { window, document } = await mount();

  const input = document.querySelector("#search");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, "Parktown");
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await new Promise((resolve) => window.setTimeout(resolve, 0));

  document.querySelector(".project-card").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => window.setTimeout(resolve, 0));

  const card = document.querySelector(".detail-card");
  assert.ok(card, "应出现详情卡片");
  assert.match(card.textContent, /D18/, "应显示邮区代码");
  assert.match(card.textContent, /淡滨尼/, "应显示邮区名称");

  // Parktown Residence is a UOL / SingLand / CapitaLand joint venture.
  const groupLinks = [...card.querySelectorAll(".developer-group")];
  assert.ok(groupLinks.length > 1, "合资项目应列出多个集团");
  assert.ok(groupLinks.some((a) => /UOL/.test(a.textContent)), "应包含 UOL");
  assert.ok(groupLinks.every((a) => a.href.startsWith("https://")), "集团链接应为 https");

  const history = [...card.querySelectorAll(".developer-history li a")];
  assert.ok(history.length > 0, "应列出开发商其他楼盘");
  assert.ok(history.every((a) => a.target === "_blank" && /noopener/.test(a.rel)), "外链应安全打开");

  const years = [...card.querySelectorAll(".developer-history .history-year")]
    .map((el) => Number(el.textContent)).filter(Number.isFinite);
  assert.deepEqual(years, [...years].sort((a, b) => b - a), "历史楼盘应按年份由近到远");
});

test("有官方项目页时主按钮跳官网，否则退回搜索", async () => {
  const { window, document } = await mount();
  const input = document.querySelector("#search");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;

  setter.call(input, "Terra Hill");
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  document.querySelector(".project-card").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => window.setTimeout(resolve, 0));

  const action = document.querySelector(".primary-action");
  assert.match(action.textContent, /官方项目页/);
  assert.match(action.href, /hoihup\.com/, "应指向开发商自有域名");
});

test("交互控件带有 aria-pressed 状态", async () => {
  const { document } = await mount();
  const tabs = document.querySelectorAll(".status-tabs button[aria-pressed]");
  assert.equal(tabs.length, 5);
  const layers = document.querySelectorAll(".map-layers button[aria-pressed]");
  assert.equal(layers.length, 5);
});

test("临界楼盘同时显示确定与部分栋两个口径", async () => {
  const { window, document } = await mount();
  const input = document.querySelector("#search");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;

  setter.call(input, "Reserve Residences");
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  document.querySelector(".project-card").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => window.setTimeout(resolve, 0));

  const text = document.querySelector(".detail-card .school-count").textContent;
  assert.match(text, /1km 内 1 所小学/);
  assert.match(text, /另 1 所仅部分栋可及/);
  assert.ok(document.querySelector(".detail-card .school-note"), "应给出门牌跨度的说明");
});

test("邮区图层默认关闭，开启后才下载边界并画出色块", async () => {
  const { window, document, requested } = await mount();
  assert.ok(!requested.includes("districts.json"), "默认不应下载邮区边界");

  const toggle = [...document.querySelectorAll(".map-layers button")]
    .find((b) => b.textContent.includes("邮区"));
  assert.ok(toggle, "应有邮区图层按钮");
  assert.equal(toggle.getAttribute("aria-pressed"), "false");

  toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  for (let i = 0; i < 12; i += 1) await new Promise((r) => window.setTimeout(r, 0));

  assert.equal(toggle.getAttribute("aria-pressed"), "true");
  assert.ok(requested.includes("districts.json"), "开启后应下载邮区边界");

  const legend = document.querySelector(".district-legend");
  assert.ok(legend, "应显示供应量图例");
  assert.match(legend.textContent, /当前筛选下的项目数/);
});

test("邮区色块用单色渐变编码供应量，而非 28 种身份色", async () => {
  const districts = await readData("districts.json");
  const seen = new Set(districts.features.map((f) => f.properties.district));
  assert.equal(seen.size, 28, `应覆盖 28 个邮区，实际 ${seen.size}`);
  assert.equal(Object.keys(districts.labels ?? {}).length, 28, "每个邮区应有一个标签锚点");

  const source = await readFile(new URL("app/districtLayer.ts", projectRoot), "utf8");
  const hexes = new Set([...source.matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0].toLowerCase()));
  assert.ok(hexes.size <= 6, `渐变档位应精简，实际 ${hexes.size} 个色值`);
});
