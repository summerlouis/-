# 套餐与最新版入口

2026-11-05：在现有 Cloudflare 系统增加固定价格套餐。后续修改从本版本和 `bao-realtime-local-20261028` 分支继续，勿回退到旧 chatgpt.site 页面。

正式入口：https://bao-dumpling-api.buyehou66.workers.dev/ ，收银 `/pos.html`，管理 `/admin.html`，厨房 `/kitchen.html`，历史 `/owner.html`。

- M1 Menu Bao：默认 2 个包子 + 1 杯饮品，3.50 €。
- M2 Menu Raviolis：默认 1 份 9 个饺子 + 1 杯饮品，5.50 €。
- 每份主食分别选产品、馅料、做法，固定套餐价，无补差价。各位置可重复选择产品。
- 后台“商品管理 → 配置套餐”修改名称、价格、主食/饮品份数及允许商品，现有上下架按钮适用。
- 商品售罄后不可选；必选组没有任何可售项则整个套餐暂不可售。正在编辑的套餐提交前重新检查配置和价格。
- 订单父行记录套餐价格，components 是每套组成快照；数量乘套餐父行，组成不额外计费。厨房和历史展示同一快照。
- 已付款订单不跟随后续商品、套餐价格调整；整单取消后厨房同步移除。
- 仍为模拟付款，不扣款。数据库迁移 `drizzle/0007_bundles.sql` 先于新 Worker 部署执行，仅新增 bundle_json 列。

本地验证：启动 Wrangler 在 58918 端口后，执行 `node tests/bundles.cjs` 和 `node tests/bundles-ui.cjs`。测试只修改本地数据库。

部署版本：5bf0d79a-c9dc-4b39-9786-127ee5fba48c。
