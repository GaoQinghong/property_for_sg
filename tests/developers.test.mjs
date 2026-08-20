/**
 * Guards the developer directory. Its whole value is that attributions and
 * links are verified rather than guessed, so these tests enforce the rules
 * that keep it that way.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readData = async (name) =>
  JSON.parse(await readFile(new URL(`../public/data/${name}`, import.meta.url), "utf8"));

const norm = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

function resolveGroups(project, directory) {
  const developer = String(project.developer ?? "").toLowerCase().trim();
  const override = directory.spvOverrides[developer];
  if (Array.isArray(override) && override.length) {
    const groups = override.map((key) => directory.groups[key]).filter(Boolean);
    if (groups.length) return groups;
  }
  const entries = Object.entries(directory.groups);
  const key = norm(project.name);
  const claimed = entries.filter(([, g]) => g.projects.some((e) => norm(e.name) === key)).map(([, g]) => g);
  if (claimed.length) return claimed;
  return entries.filter(([, g]) => g.match.some((n) => developer.includes(n))).map(([, g]) => g);
}

test("每个集团条目都完整且链接指向自有域名", async () => {
  const directory = await readData("developers.json");
  for (const [key, group] of Object.entries(directory.groups)) {
    assert.ok(group.name, `${key} 缺少 name`);
    assert.ok(group.website?.startsWith("https://"), `${key} 的 website 非 https`);
    assert.ok(group.source?.startsWith("https://"), `${key} 缺少可核查的 source`);
    assert.ok(Array.isArray(group.match), `${key} 缺少 match`);

    // Every project link must sit on a domain the group has declared as its
    // own — the whole point is to never link visitors to an agent lead-gen site.
    const owned = group.domains ?? [new URL(group.website).hostname.replace(/^www\./, "")];
    for (const entry of group.projects) {
      assert.ok(entry.name, `${key} 存在无名历史项目`);
      assert.ok(entry.url?.startsWith("https://"), `${key}/${entry.name} 的 url 非 https`);
      const entryHost = new URL(entry.url).hostname.replace(/^www\./, "");
      assert.ok(
        owned.some((domain) => entryHost === domain || entryHost.endsWith(`.${domain}`)),
        `${key}/${entry.name} 链接到了未声明的域名：${entryHost}`,
      );
      if ("year" in entry) {
        assert.ok(Number.isInteger(entry.year) && entry.year > 1990 && entry.year < 2040,
          `${key}/${entry.name} 年份不合理：${entry.year}`);
      }
      if ("sourceUrl" in entry) {
        assert.ok(entry.sourceUrl?.startsWith("https://"), `${key}/${entry.name} 的 sourceUrl 非 https`);
      }
      if ("yearType" in entry) {
        assert.ok([
          "actual_top", "completion", "estimated_top", "estimated_completion", "expected_vp", "unknown",
        ].includes(entry.yearType), `${key}/${entry.name} 的 yearType 不受支持：${entry.yearType}`);
        assert.ok("top" in entry, `${key}/${entry.name} 有 yearType 但没有对应日期`);
      }
      if ("units" in entry) {
        assert.ok(Number.isInteger(entry.units) && entry.units > 0, `${key}/${entry.name} 户数不合理`);
      }
    }
  }
});

test("spvOverrides 指向的集团都存在", async () => {
  const directory = await readData("developers.json");
  for (const [spv, keys] of Object.entries(directory.spvOverrides)) {
    if (spv.startsWith("_")) continue;
    assert.ok(Array.isArray(keys) && keys.length, `${spv} 的取值应为非空数组`);
    for (const key of keys) {
      assert.ok(directory.groups[key], `${spv} 指向了不存在的集团 ${key}`);
    }
  }
});

test("集团内部历史项目不重名", async () => {
  const directory = await readData("developers.json");
  for (const [key, group] of Object.entries(directory.groups)) {
    const names = group.projects.map((entry) => norm(entry.name));
    assert.equal(new Set(names).size, names.length, `${key} 存在重复项目`);
  }
});

test("能为项目解析出集团，且解析结果稳定", async () => {
  const [{ projects }, directory] = await Promise.all([
    readData("projects.json"),
    readData("developers.json"),
  ]);
  const resolved = projects.filter((project) => resolveGroups(project, directory).length > 0);
  // Coverage is partial by design — every entry is individually verified — but
  // it must not silently regress to nothing.
  assert.ok(resolved.length >= 25, `仅解析出 ${resolved.length} 个项目的开发商集团`);

  const parktown = projects.find((project) => /parktown/i.test(project.name));
  if (parktown) {
    const names = resolveGroups(parktown, directory).map((group) => group.name);
    assert.ok(names.includes("UOL Group"), `Parktown 应归属 UOL，实际 ${names}`);
    assert.ok(names.length > 1, "Parktown 是合资项目，应列出多个集团");
  }
});

test("历史楼盘按时间由近到远排序", async () => {
  const directory = await readData("developers.json");
  const cdl = directory.groups["cdl"];
  const dated = cdl.projects.filter((entry) => entry.year);
  const sorted = [...dated].sort((a, b) => b.year - a.year);
  assert.deepEqual(
    sorted.map((entry) => entry.year),
    [...dated.map((entry) => entry.year)].sort((a, b) => b - a),
  );
});
