# property_for_sg

新加坡私人住宅与 EC 的研究地图，部署在 GitHub Pages。

## 开工前

**先读 [progress.md](progress.md)** —— 当前状态、在飞分支、未解决问题、环境限制都在那里。读完用 `git log --oneline -8` 和 `git branch -a` 核对是否已过期。

做完一段工作后回头更新 `progress.md`。

## 数据原则

这是买房决策工具，数据错了会误导人。拿不准就标「待查证 / 待定位」，不要填一个看起来合理的值。详见 `progress.md` 的「数据原则」一节和 README。

## 验证

浏览器扩展在本机连不上，无法截图。前端改动靠 `npm test` 里的 jsdom 集成测试验证；涉及视觉效果的改动需要人工在浏览器里确认。

提交前跑：`npm run lint && npm run typecheck && npm test && npm run build`。
