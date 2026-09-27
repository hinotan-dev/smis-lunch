# SMIS 午餐 · Cezars Kitchen

St. Mary's International School 每日午餐菜单。中英对照，标出需要自备主食的日子，每天可以写备注。

## 目录

```
index.html              打包产物（由 npm run build 生成，直接部署这一个文件）
shell.html              HTML 模板，bundle 内联进 __BUNDLE__ 占位符
smis-lunch.jsx          源码
seed.generated.js       自动生成的数据清单，不要手改
manifest.webmanifest    PWA 配置
data/                   每月菜单 JSON
assets/                 图标
scripts/                构建与自动抓取
mkicons_final.py        图标生成
```

## 部署

仓库整包推上 Vercel，无需构建步骤——`index.html` 已经是打包结果，随代码一起提交。

`vercel.json` 里显式关掉了构建（`outputDirectory: "."`）。因为仓库里有 `package.json`，Vercel 会自动探测并尝试 `npm run build`，钉死配置免得它自作主张。想反过来让 Vercel 每次自己构建也行，把 `buildCommand` 改成 `"npm run build"` 即可——那样直接在 GitHub 网页上改 `data/` 里的 JSON 也能触发更新。

## 加新月份

三条路：

**全自动（默认）**
`.github/workflows/menu-watch.yml` 每月 25–31 日各跑一次，检查学校 PDF 里有没有 `data/` 里还没有的月份。有的话调 Claude API 生成 JSON、跑校验、重新打包，然后开一个 PR。你在手机上看一眼 `data/` 里的 diff，合并即部署。

校验不通过时不开 PR，改开 issue。

### 认证：Workload Identity Federation

仓库里**不存任何长期密钥**。每次运行由 GitHub 签发一个 OIDC JWT，SDK 拿它去 Anthropic 换一个几分钟就过期的 token。

一次性设置：

1. Claude Console → Settings → Workload identity → Connect workload → 选 GitHub Actions
2. 向导里把匹配条件填成这个仓库（可以细到分支，例如 `repo:<owner>/<repo>:ref:refs/heads/main`）
3. 建好后拿到三个 ID，填进仓库 Settings → Secrets and variables → Actions → **Variables**：

| Variable | 形如 |
|---|---|
| `ANTHROPIC_FEDERATION_RULE_ID` | `fdrl_...` |
| `ANTHROPIC_ORGANIZATION_ID` | UUID |
| `ANTHROPIC_SERVICE_ACCOUNT_ID` | `svac_...` |
| `ANTHROPIC_WORKSPACE_ID` | `wrkspc_...`（没建 workspace 就不填） |
| `CLAUDE_MODEL` | 可选，默认 `claude-opus-5` |

这几个是标识符不是密钥，放 Variables 就行——安全性来自 federation rule 只认你指定的仓库和分支，别处拿着 JWT 也换不到 token。

工作流里 `permissions: id-token: write` 是必需的，少了这行取不到 JWT。

**也支持 API key**：给一个 `ANTHROPIC_API_KEY`（这个要放 Secrets）就会自动改走 key，脚本不用改。本地跑的时候通常用这条。

注意 API 是按量付费，和 Claude 订阅是两套账，Console 里要单独 top up。

**手动跑一次**
Actions 页面点 "每月抓新菜单" → Run workflow。或者本地：

```bash
npm ci
node scripts/check-months.mjs                        # 看缺哪些月
node scripts/generate-month.mjs .tmp/cezars.pdf 2026-11
npm run build
```

学校站点抓不到时，可以自己下载 PDF 再喂给它：
```bash
MENU_PDF=~/Downloads/cezars.pdf node scripts/check-months.mjs
```

**手工（把 PDF 丢给 Claude 生成 JSON）**
把 JSON 存成 `data/lunch-YYYY-MM.json`，然后 `npm run build`。不用改 `smis-lunch.jsx`——`seed.generated.js` 会自动把 `data/` 里所有月份收进去。

临时应急也可以完全不碰代码：在网站里点设置 →「菜单数据」→ 粘贴 JSON →「添加到本地」，只存在这台设备。同一个月内置和本地都有时以内置为准，正式更新后把本地那份删掉即可。

## 脚本

| 脚本 | 作用 |
|---|---|
| `scripts/check-months.mjs` | 下载 PDF，读出里面有哪几个月，跟 `data/` 比，输出缺的月份 |
| `scripts/generate-month.mjs` | 把 PDF 交给 Claude API 生成某个月的 JSON，带译名词典和格式范例，生成后自动校验。认证走 WIF 或 API key，由环境变量决定 |
| `scripts/validate-month.mjs` | 机械校验：日期是工作日且属于本月、items 的 kind 顺序、中文非空、过敏原取值、热量区间 |
| `scripts/gen-seed.mjs` | 扫描 `data/` 生成 `seed.generated.js` |
| `scripts/build.mjs` | gen-seed → esbuild → 内联进 `shell.html` → 写出 `index.html` |

## 数据格式

```json
{
  "month": "2026-10",
  "days": [
    {
      "date": "2026-10-01",
      "type": "menu",
      "kcal": 900,
      "protein": 30.0,
      "allergens": ["EGG", "DAIRY", "WHEAT"],
      "items": [
        { "kind": "main", "en": "Teriyaki Chicken", "zh": "照烧鸡" },
        { "kind": "veg",  "en": "Teriyaki Tofu",    "zh": "照烧豆腐" },
        { "kind": "carb", "en": "White Rice",       "zh": "白饭" },
        { "kind": "side", "en": "...",              "zh": "..." },
        { "kind": "salad","en": "Mixed Green Salad","zh": "综合生菜沙拉" },
        { "kind": "drink","en": "Drink",            "zh": "饮料" },
        { "kind": "dessert","en": "Fruits Jelly",   "zh": "水果啫喱" }
      ]
    },
    { "date": "2026-10-12", "type": "closed", "label": "No School", "labelZh": "不上课" }
  ]
}
```

可选字段：`event` / `eventZh`（当天主题，如 Coconut Day）、`staple`（`"ok"` 或 `"warn"`，手动覆盖主食判定）、`kcalNote`。

## 菜品 emoji

每一行的图标由菜名自动匹配（`smis-lunch.jsx` 顶部的 `RULES` / `DESSERT_RULES`），从具体到笼统，命中即停。甜点单独一套规则，所以 Carrot Cake 是 🍰 不是 🥕，Apple Wedges 是 🍎 不是 🍟，Chocolate Cake 单独用 🍫。加了新菜名觉得图标不对，调这两张表的顺序即可。

## 图标

`assets/` 里五个文件由 `mkicons_final.py` 生成，方角全出血（圆角交给系统切）。版式取自课表 app 的实测比例，两个图标并排是一套：横杠宽 0.438S、高 0.0547S、顶边 0.725S，文字底边 0.561S。配色 #FFF0C2 / #3A2A12 / #F2A900，字体 Archivo 700（favicon.svg 已转成路径，不依赖字体加载）。

## 自备主食的判定

菜单里有完整的 White Rice → 不提醒；只有 Half Rice、或当天根本没有米饭（披萨、意面、汉堡日）→ 标 ▲。

## 备注

输入框字号是 16px，不是随便定的：iOS Safari 在聚焦字号小于 16px 的输入控件时会自动放大页面，而且失焦后不会退回去。加新的输入控件时别低于 16px。（另一种解法是 viewport 里写 `maximum-scale=1`，但那会连带禁掉双指缩放，不划算。）

存在浏览器本地，换设备不同步。设置 →「备注」里可以导出 / 导入 JSON 备份。

## 最新菜单来源

<https://powerschool.smis.ac.jp/public/cezars.pdf>
