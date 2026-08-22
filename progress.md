# 进度

这份文件记录本项目的当前状态、在飞工作与未解决问题。**每次开工先读它，读完用 `git log --oneline -8` 和 `git branch -a` 核对是否已过期**（这份文件靠人工维护，可能落后于仓库）。

最后更新：2026-08-22

---

## 当前状态

线上：<https://gaoqinghong.github.io/property_for_sg/>，从 `main` 自动部署。
CI 会先跑 lint → typecheck → test → build，全过才部署。

### 已上线

| 内容 | 说明 |
| --- | --- |
| 修复线上只显示 6 条假数据 | `visible` 的 useMemo 漏了 `projects` 依赖，fetch 回来的 124 条永远进不了界面 |
| 124/124 项目精确坐标 | 原先 67 个是邮区中心估算。根因：geocode 查询多加了 `, Singapore` 让 OneMap 永远返回 0 结果；旧坐标复用又不校验精度，兜底坐标永久粘住 |
| 最近地铁 / 最近小学 / 1km 内小学数 | 补全 124 个项目，替换掉 118 个「待计算」占位符 |
| 学校坐标按 MOE 邮编校准 | 原 OSM 坐标 326 所里 304 所偏差 >10m，足以影响 1km 判定 |
| 1km 优先权按门牌点计算 | 大楼盘多门牌、跨度可达数百米，拆成「全部门牌在 1km 内」和「仅部分栋可及」两个口径 |
| 开发商集团目录 | URA 登记的是项目公司（SPV），需还原成集团；含历史楼盘与官方链接 |
| 前端重写 | 懒加载图层、canvas 渲染站点、视口裁剪、移动端恢复列表、对比度与字号修正、假按钮改为真功能 |
| 工程化 | 删除全部脚手架残留、修好坏掉的测试、CI 真正跑校验 |

邮区图层已于 `0447cc2` 合并进 main 并部署。做法与局限见 README「邮区边界与色块」一节。

---

## 未解决

### 邮区边界在页面上看不到（最高优先级）

用户反馈：打开线上站点，点「D 邮区」图层后**看不到边界和色块**。**尚未定位，下次开工先查这个。**

已排除的：

- 线上跑的确实是最新构建 —— `index-DKJPbgSn.js` 与本地构建产物哈希一致
- bundle 里含全部相关代码（`邮区`、`districts.json`、`当前筛选下的项目数`、`该分区跨`、`district-label` 均能搜到）
- `districts.json` 线上返回 200，332 个多边形 / 28 个 D 区 / 28 个标签点，数字与本地一致
- CI `Deploy GitHub Pages` → success
- 不是缓存（已让用户硬刷新）

**下一步该查的**（按怀疑程度排序）：

1. **几何是否被简化坏了。** `scripts/build-districts.mjs` 里对每个 ring 跑 Douglas-Peucker，但闭合 ring 的首尾是同一个点，`perpendicular()` 对退化线段的处理可能产出无效多边形。先直接看 `public/data/districts.json` 里的坐标是否合理、ring 是否闭合、能否被 geojson 校验器接受。
2. **坐标顺序。** GeoJSON 是 `[lng, lat]`，确认 `simplifyGeometry` 与 `centroidOf` 没有把 x/y 弄反（`centroidOf` 累加 `ring[j][0]` 当 lng）。
3. **运行时是否抛错。** 浏览器控制台看有没有 `L.geoJSON` 相关异常；jsdom 测试用的是 Leaflet 桩，抓不到真实 Leaflet 的报错。
4. **视觉太弱。** fillOpacity 0.42 + 0.7px 描边叠在 OSM 瓦片上是否根本看不出来。

注意 `tests/ui.test.mjs` 里的邮区测试**通过了也不能说明它在真实 Leaflet 里能画出来** —— 那套测试用的 Leaflet 是 Proxy 桩，任何调用都不会失败。这正是它没能拦住这个问题的原因。

### 每日数据更新校验失败

### 每日数据更新校验失败

2026-08-19 22:49 的 `Update property data` 在 `Validate data` 步骤失败。**这是校验按设计拦下了有问题的数据，`projects.json` 没被污染**，但具体哪条断言失败没定位到 —— Actions 日志接口要鉴权（403）。

commit `9d81a99` 已加诊断：校验失败时会把被拒的 `projects.json` 和失败断言作为 artifact 上传，并写进 job summary。**下次失败先看那个 artifact，不要再猜。**

当时的猜测（未证实，别当结论）：URA 新数据出现 `sold > units`，或 `scripts/lib/text.mjs` 的乱码修复表里没有的新破损字符。

---

## 环境限制

- **浏览器扩展一直连不上，没法截图验证 UI。** 前端验证靠 jsdom + esbuild 把真实组件挂起来跑集成测试（`tests/ui.test.mjs`）。涉及视觉效果的改动，需要人工在浏览器里确认。
- **Actions 日志接口 403**（即使公开仓库也要鉴权）。失败原因看 workflow 上传的 artifact 和 job summary。
- **GitHub 未认证 API 限额 60/小时**，不要用轮询去打。
- **本机 `~/.npmrc` 指向字节内网源。** 项目已加 `.npmrc` 锁定公共源覆盖它 —— 曾经因此让 lockfile 里 67 个包指向内网地址，CI 直接装不上。改依赖后确认 lockfile 全部指向 `registry.npmjs.org`。

---

## 数据原则

这是买房决策工具，数据错了会误导人。**拿不准就标「待查证 / 待定位」，不要填一个看起来合理的值。**

- 链接只能指向开发商自有域名（`developers.json` 的 `domains` 声明）。搜索「某楼盘 官网」出来的几乎全是中介引流站，不能用。`tests/developers.test.mjs` 强制这条。
- `locationAccuracy !== "exact"` 的项目不给距离数据，显示「待定位」。
- 开发商归属逐条查证，合资项目列出全部参与方。覆盖不全可以接受，编造不行。

---

## 常用命令

```bash
npm run dev                        # 本地开发
npm test                           # 数据校验 + UI 集成测试
npm run lint && npm run typecheck

npm run data:backfill-locations    # 重新地理编码 + 重算距离
npm run data:recalibrate-schools   # 按邮编校准学校坐标
npm run data:capture-footprints    # 抓门牌点 + 重算 1km 口径
npm run data:build-districts       # 重建邮区边界
npm run data:simplify-rail         # 简化轨道线路几何
```

---

## 维护约定

做完一段工作后更新本文件：改「当前状态」、加或消「未解决」、更新顶部日期。不要把它写成流水账 —— 只留下次开工需要知道的东西。
