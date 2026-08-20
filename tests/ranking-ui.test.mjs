import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { before } from "node:test";
import { JSDOM } from "jsdom";
import * as esbuild from "esbuild";

const root = new URL("../", import.meta.url);
const readData = async (name) => JSON.parse(
  await readFile(new URL(`public/data/${name}`, root), "utf8"),
);

let bundle;
let files;

before(async () => {
  files = {
    "projects.json": await readData("projects.json"),
    "developers.json": await readData("developers.json"),
  };
  const result = await esbuild.build({
    entryPoints: [new URL("tests/fixtures/mount-ranking.tsx", root).pathname],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    jsx: "automatic",
    loader: { ".css": "empty" },
  });
  bundle = result.outputFiles[0].text;
});

async function mount() {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "http://localhost/property_for_sg/#/developers",
    pretendToBeVisual: true,
    runScripts: "outside-only",
  });
  dom.window.fetch = async (input) => {
    const name = String(input).split("/").pop();
    const data = files[name];
    return data
      ? { ok: true, status: 200, json: async () => data }
      : { ok: false, status: 404, json: async () => ({}) };
  };
  dom.window.eval(bundle.replace(/^export\s*\{[^}]*\};?$/m, ""));
  for (let index = 0; index < 12; index += 1) {
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  }
  return dom.window;
}

test("排名页渲染全部集团、方法和安全外链", async () => {
  const window = await mount();
  const { document } = window;
  assert.match(document.querySelector(".ranking-hero h2").textContent, /当前活跃度排名/);
  assert.equal(document.querySelectorAll("details.rank-card").length, 16);
  assert.deepEqual(
    [...document.querySelectorAll(".method-card dt")].map((element) => element.textContent),
    ["55%", "45%"],
  );
  assert.equal(document.querySelectorAll("details.rank-card[open]").length, 1);
  for (const link of document.querySelectorAll('a[target="_blank"]')) {
    assert.match(link.rel, /noopener/);
    assert.match(link.rel, /noreferrer/);
  }
});

test("排名页可按楼盘搜索并展示已核验事实", async () => {
  const window = await mount();
  const { document } = window;
  const input = document.querySelector(".developer-search input");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, "8@BT");
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await new Promise((resolve) => window.setTimeout(resolve, 0));

  assert.equal(document.querySelectorAll("details.rank-card").length, 1);
  const row = [...document.querySelectorAll(".portfolio-row")]
    .find((element) => element.textContent.includes("8@BT"));
  assert.match(row.textContent, /2027 Q4/);
  assert.match(row.textContent, /预计 TOP/);
  assert.match(row.textContent, /158/);
  assert.match(row.textContent, /99 年/);
  assert.ok(row.querySelector(".fact-source"));
});
