# 进度

这份文件记录本项目的当前状态、在飞工作与未解决问题。**每次开工先读它，读完用 `git log --oneline -8` 和 `git branch -a` 核对是否已过期**（这份文件靠人工维护，可能落后于仓库）。

最后更新：2026-08-26

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
| 邮区外轮廓 | 将 332 个 URA 分区按 D01–D28 融合成 28 条独立深色外轮廓；内部边线降为弱提示，真实 Leaflet 已截图验证 |
| 楼盘用途 | 124/124 项目展示「纯住宅* / 商住一体」；商住项目用已核验名称或 URA 登记商业实体识别，其余明确标为 URA 住宅数据推定 |
| 楼盘产权 | 124/124 项目均显示产权；107 个有明确值，其中 105 个直接匹配 URA 新售/转售成交 Tenure（保留租期起算年），17 个未成交项目标「待公布」 |
| URA 市场区图层 | 独立显示 CCR / RCR / OCR。只重描区域间公共分界，不画海岸线；开启时降低楼盘标记透明度，以白色光晕＋6px 深色线突出 CCR–RCR、RCR–OCR |
| 20 年私宅分析 | 新增 `#/analysis` 站内报告页；开篇加入 2021–2026 整体私宅 PPI 与实际 GDP 对比，末尾加入二手/新盘数据检查表、三层分析、Safety Margin 与 Premium Years 决策框架；明确以周边二手成交作为新盘退出价格锚 |

邮区图层已于 `0447cc2` 合并进 main 并部署。做法与局限见 README「邮区边界与色块」一节。

---

## 未解决

邮区边界问题已解决。根因不是数据或 Leaflet 报错，而是原界面只以相同强度画出 332 个 URA 子区边线，没有 28 个邮区的独立外轮廓；密集项目标记进一步遮挡后，看起来像没有边界。`scripts/build-districts.mjs` 现在生成 `boundaries`，前端用深蓝粗线单独绘制。

### 每日数据更新校验失败

### 每日数据更新校验失败

2026-08-19 22:49 的 `Update property data` 在 `Validate data` 步骤失败。**这是校验按设计拦下了有问题的数据，`projects.json` 没被污染**，但具体哪条断言失败没定位到 —— Actions 日志接口要鉴权（403）。

commit `9d81a99` 已加诊断：校验失败时会把被拒的 `projects.json` 和失败断言作为 artifact 上传，并写进 job summary。**下次失败先看那个 artifact，不要再猜。**

当时的猜测（未证实，别当结论）：URA 新数据出现 `sold > units`，或 `scripts/lib/text.mjs` 的乱码修复表里没有的新破损字符。

---

## 环境限制

- **可使用 Codex 应用内浏览器做本地截图验证。** 仍保留 jsdom 集成测试作为 CI 回归保护；真实 Leaflet 的视觉与路径结果应在本地预览复核。
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
npm run data:build-market-regions  # 从邮区底层分区重建 CCR/RCR/OCR
npm run data:simplify-rail         # 简化轨道线路几何
```

---

## 维护约定

做完一段工作后更新本文件：改「当前状态」、加或消「未解决」、更新顶部日期。不要把它写成流水账 —— 只留下次开工需要知道的东西。
