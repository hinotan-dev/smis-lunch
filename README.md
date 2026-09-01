# SMIS 午餐 · Cezars Kitchen

St. Mary's International School 每日午餐菜单。中英对照，标出需要自备主食的日子，每天可以写备注。

## 目录

```
index.html              打包好的成品，直接部署这一个文件即可（JS 已内联）
smis-lunch.jsx          源码
manifest.webmanifest    PWA 配置
data/                   每月菜单 JSON
assets/                 图标
```

## 部署

仓库根目录整包推上 Vercel 即可，无需构建步骤——`index.html` 已经是打包结果。

## 加新月份

两条路，随便走哪条：

**临时（手机上就能做）**
把新的 Cezars PDF 发给 Claude，让它生成该月 JSON，在网站里点右上角设置 →「菜单数据」→ 粘贴 →「添加到本地」。数据只存在这台设备，够用到下次更新代码。

**正式（有电脑时）**
1. 把 JSON 存成 `data/lunch-YYYY-MM.json`
2. 在 `smis-lunch.jsx` 顶部加两行：

```js
import oct2026 from "./data/lunch-2026-10.json";
const SEED = [aug2026, sep2026, oct2026];
```

3. 重新打包：

```bash
npx esbuild smis-lunch.jsx --bundle --minify --loader:.json=json \
  --define:process.env.NODE_ENV='"production"' --outfile=bundle.js
```

然后把 `bundle.js` 内容替换进 `index.html` 的 `<script>` 里（或让 Claude 直接生成新的 index.html）。

同一个月内置和本地都有时以内置为准，更新完可以去设置里把本地那份删掉。

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

## 自备主食的判定

菜单里有完整的 White Rice → 不提醒；只有 Half Rice、或当天根本没有米饭（披萨、意面、汉堡日）→ 标 ▲。

## 备注

存在浏览器本地，换设备不同步。设置 →「备注」里可以导出 / 导入 JSON 备份。

## 最新菜单来源

<https://powerschool.smis.ac.jp/public/cezars.pdf>
