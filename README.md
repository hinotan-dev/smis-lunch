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

`vercel.json` 让 Vercel 每次部署自己跑 `npm run build`。好处是 **`data/` 里的 JSON 就是唯一真相**——在 GitHub 网页上（手机也行）改一行 JSON，部署时会自动重新打包，不用管 `index.html`。

仓库里仍然提交 `index.html`，是为了本地直接打开能看、以及 Vercel 万一挂了还有个能用的产物。要是哪天 Vercel 构建出问题，把 `buildCommand` 改回 `"echo skip"` 就退回纯静态。

## 加新月份

三条路：

**全自动（默认）**
`.github/workflows/menu-watch.yml` 每月 25–31 日各跑一次，检查学校 PDF 里有没有 `data/` 里还没有的月份。有的话调 Claude API 生成 JSON、跑校验、重新打包，然后开一个 PR。你在手机上看一眼 `data/` 里的 diff，合并即部署。

校验不通过时不开 PR，改开 issue。

### 两道检查

**机械校验**（`validate-month.mjs`）查结构：日期是不是工作日、items 的 kind 顺序、中文有没有漏、过敏原取值合不合法、热量在不在合理区间。查不出内容对不对——过敏原写成任何子集都是"合法"的。

**独立复核**（`verify-month.mjs`）查内容：换另一个模型重读同一份 PDF，只抽能和 PDF 逐字对照的事实字段，和生成结果机械比对：

| 查 | 为什么 |
|---|---|
| 过敏原 | 唯一有安全含义的字段，且机械校验完全无能为力 |
| kcal / 蛋白质 | 和过敏原在 PDF 同一行，顺手 |
| 六个菜的**英文名** | 抓「整列错位」——某天的菜串到隔壁列时，只看日期和数字是发现不了的 |

**不查中文译名**：没有客观标准，而且词典已经保证了跨月一致性。

复核用不同的模型是有意的——同一个模型重读同一份 PDF 很可能重复同样的误读。默认生成用 `claude-opus-5`、复核用 `claude-sonnet-5`，可以用 repository variable `CLAUDE_MODEL` / `VERIFY_MODEL` 改。

发现不一致**不挡 PR**，只把每一条列在 PR 正文顶部让你逐条确认——复核本身也可能读错。复核调用失败也不挡，只在正文里标一句没跑成。

本地想验证比对逻辑，可以不调 API：
```bash
VERIFY_REF=/tmp/ref.json node scripts/verify-month.mjs x.pdf 2026-11
```

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

WIF 是**组织级功能**，需要 admin / owner 角色。个人账户在 Console 里可能根本看不到这个入口，那就走下面的 API key。

**也支持 API key**：在仓库 Settings → Secrets and variables → Actions → **Secrets** 里加一个 `ANTHROPIC_API_KEY` 就行，工作流和脚本都不用改——脚本看环境里有什么自己决定走哪条，工作流两种变量都传了。本地跑通常也用这条。

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
| `scripts/verify-month.mjs` | 独立复核：换**另一个模型**重读 PDF，比对英文菜名、过敏原、kcal、蛋白质，不一致的列进 PR 正文 |
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

## 改样式

没有 CSS 文件，样式分两处：

**`shell.html`** —— 只有真正需要 CSS 才能表达的那几条：卡片宽度的响应式断点（`--cardw`）、页面底色、滚动条、聚焦轮廓、设置面板在手机/桌面的不同弹出方式、`prefers-reduced-motion`。

**`smis-lunch.jsx`** —— 其余全部写成内联 style 对象，跟着组件走。改哪个组件的样子，就去那个组件里改：

| 组件 | 管什么 |
|---|---|
| `Row` | 菜单里的一行：emoji + 英文 + 中文 |
| `DayCard` | 周视图的一张日卡 |
| `NoteBox` | 备注输入框 |
| `MonthView` | 月历 |
| `Chip` | 小圆角标签（今天、活动名、过敏原） |
| `WarnRibbon` | 「需要自备主食」那条 |
| `Settings` | 设置面板 |
| `shell`（文件末尾） | 整页的外框、最大宽度、字体栈 |

### 字号

文件顶部有一个全局旋钮：

```js
const SCALE = 1;      // 1.1 = 整体大 10%
```

所有 `fontSize` 都写成 `f(基准值)`，所以：

- **整体调大**：改 `SCALE` 一个数
- **只调某一处**：直接改那个 `f(18)` 里的数字

输入框走 `fInput()`，有 16px 下限——iOS 上小于 16px 会在聚焦时自动放大且不会退回，所以 `SCALE` 调小也不会把这个 bug 放回来。

### 配色

同样在文件顶部的 `C` 对象里，改一个值全站生效。注意 `shell.html` 里的底色和 `manifest.webmanifest` 里的 `theme_color` 是各自独立写的，换主色调时记得一起改。

### 改完怎么生效

改 `smis-lunch.jsx` 或 `shell.html` 之后必须重新打包：

```bash
npm run build
```

然后 commit push，Vercel 会再打包一次。**只改 `data/` 里的 JSON 不用打包**，Vercel 自己会做。

本地想边改边看：`npm run build` 之后直接在浏览器打开 `index.html` 就行，不需要起服务器。

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
