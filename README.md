# 狮城新盘地图 · property_for_sg

新加坡私人住宅与 EC 的研究地图：在 Leaflet 地图上叠加 URA 在售 / 即将开盘 / 确定开发 / 土地供应项目，以及地铁线路、学校与商场。

线上地址：<https://gaoqinghong.github.io/property_for_sg/>

## 开发

```bash
npm install
npm run dev        # 本地开发服务器
npm run build      # 构建到 pages-dist/
npm run preview    # 预览构建产物
npm run lint
npm run typecheck
npm test
```

需要 Node.js `>=22.13.0`。

## 结构

```
index.html              入口，挂载 src/main.tsx
app/
  page.tsx              主组件：侧边栏、地图、详情卡片、数据说明弹窗
  useMapData.ts         数据加载 hooks（项目立即加载，图层数据按需加载）
  types.ts              共享类型与常量
  globals.css           全站样式
public/data/            运行时读取的数据文件
scripts/
  lib/geo.mjs           haversine、坐标校验、OneMap 地理编码（含限流退避）
  lib/enrich.mjs        由坐标推导最近地铁与 1km 内小学
  lib/text.mjs          修复 URA 数据的编码破损
  update-projects.mjs   每日从 URA API 同步项目与库存
  backfill-locations.mjs 重新地理编码仍用邮区中心兜底的项目
  simplify-rail.mjs     简化轨道线路几何
tests/                  数据校验与 UI 集成测试
```

## 数据

| 文件 | 内容 | 来源 |
| --- | --- | --- |
| `projects.json` | 项目、库存、坐标、最近地铁与小学 | URA 开发商销售月报 + 供应管道 |
| `mrt-stations.json` / `mrt-lines.json` | 轨道站点与线路（含规划中） | OpenStreetMap |
| `schools.json` | 中小学名录与坐标 | MOE + OpenStreetMap |
| `malls.json` | 商场坐标 | OpenStreetMap |
| `developers.json` | 开发商集团、官网、代表楼盘与事实来源 | 开发商官网、年报、SGX、项目官方资料（人工查证） |
| `project-audit.json` | 每次同步被排除 / 降级的项目 | 更新脚本产出 |

### 开发商集团目录

URA 的 `developer` 字段登记的是项目公司（SPV），不是集团 —— 124 个项目里有 121 个不同的 SPV 名，而且多数项目是合资。`developers.json` 负责把 SPV 还原成集团，解析顺序：

1. `spvOverrides` 里逐条人工查证过的映射（合资项目列出全部参与方）
2. 项目出现在某集团官网自己发布的项目列表里
3. SPV 名本身带集团品牌（如 `CDL Selesta Pte Ltd`）

**这份目录是覆盖不全的，这是刻意的** —— 每一条归属和链接都经过单独查证，宁可留空也不推测。目前收录 16 个集团、153 条可核验或当前项目记录；UOL 与其子公司 Singapore Land 合并为同一排名实体。解析不出集团的项目只显示 URA 登记的开发商名，并标注「所属集团待查证」。

`url` 只允许指向开发商自有域名（在 `domains` 字段声明），确保地图主按钮始终打开开发商页面；事实证据另存在 `sourceUrl`，可指向开发商年报、SGX 或项目官方资料。中介引流站一律不收，`tests/developers.test.mjs` 会强制校验。日期通过 `yearType` 区分实际 TOP、竣工、预计 TOP、预计竣工和预计空置交付，不把不同口径混写。

### 自动更新

`.github/workflows/update-property-data.yml` 每日调用 URA API 刷新 `projects.json`，跑一遍数据校验测试后提交；随后触发 Pages 部署。需要仓库 secret `URA_ACCESS_KEY`。

### 距离口径

详情卡片里的「最近地铁」「最近小学」是由项目坐标计算的**直线距离**，不是步行距离。只有 `locationAccuracy: "exact"` 的项目才会给出距离；仍在用邮区中心估算位置的项目一律显示「待定位」，避免把估算坐标算出的数字当成事实呈现。

学校坐标按 MOE 登记邮编在 OneMap 上重新校准过。原先来自 OSM 的坐标里，326 所中有 304 所偏差超过 10m、126 所超过 50m —— 画图钉无所谓，但足以让一所学校在 1km 判定上进出。

### 1km 小学优先权

MOE 按每户**实际门牌地址**量 1km，而大型楼盘会登记多个门牌、跨度可达数百米。例如 The Reserve Residences 到 Methodist Girls' Primary，21 Jalan Anak Bukit 是 989m（在范围内），15 号是 1083m（不在）。

因此本站对每个门牌点分别计算：

- `schoolsWithin1km` — 所有门牌点都在 1km 内的学校数
- `schoolsWithin1kmPartial` — 只有部分门牌点在范围内的学校数，界面单独标注

门牌点由 `capture-footprints.mjs` 从 OneMap 抓取（含分页，Luxus Hills 这类洋房区有 60 个门牌点、跨度 818m）。目前 35/124 个项目有多个门牌点，9 个处于 1km 临界。

### 手动重跑数据

```bash
npm run data:backfill-locations    # 重新地理编码 + 重算距离
npm run data:recalibrate-schools   # 按邮编校准学校坐标
npm run data:capture-footprints    # 抓门牌点 + 重算 1km 口径
```

## 部署

推送到 `main` 即触发 GitHub Pages 构建（先跑 lint / typecheck / test，再构建 `pages-dist/`）。`vite.config.ts` 里的 `base` 必须与仓库名一致。

### 邮区边界与色块

新加坡没有官方的 D01–D28 多边形 —— 邮区由邮编前两位（sector）定义，不是画好的边界。`scripts/build-districts.mjs` 以 URA Master Plan 官方分区边界（332 个 subzone）为几何底子，用落在其中的地址邮编标出所属 D 区，相邻同区的分区在图上自然连成一片。

sector → 邮区的映射（`scripts/lib/districts.mjs`）与 124 个项目的 URA 官方标注比对过，114/116 一致；2 处差异是 URA 自身在交界处与邮编口径不符。

已知局限，界面均有标注：

- **12/332 个分区横跨两个邮区**（如 Ulu Pandan 跨 D10/D21），按占多数者着色
- **61 个分区内没有任何地址**（水体、军事用地、港口），归属按最近分区推断

色块用**单色渐变编码当前筛选下的项目数**，不是 28 种身份色 —— 28 种颜色远超人眼可区分的分类色上限，且颜色本身不承载信息。身份由 D 编号标签承载。渐变档位经 `dataviz` 的调色板验证器（ordinal 模式）全项通过，调整颜色前须重跑。

```bash
npm run data:build-districts   # 重新拉取边界并重算归属
```
