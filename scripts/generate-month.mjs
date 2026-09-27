#!/usr/bin/env node
/**
 * 把 PDF 交给 Claude API，生成某一个月的 JSON。
 * 用法：node scripts/generate-month.mjs <pdf> <YYYY-MM>
 * 需要环境变量 ANTHROPIC_API_KEY，可选 CLAUDE_MODEL。
 *
 * 做了两件降低出错概率的事：
 *  1. 把已有月份里所有菜名的英中对照当词典传进去，老菜的译名不会每月漂移
 *  2. 把最近一个已有月份的完整 JSON 当范例，格式照抄
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { validate } from "./validate-month.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const [pdfPath, month] = process.argv.slice(2);
if (!pdfPath || !/^\d{4}-\d{2}$/.test(month || "")) {
  console.error("用法：node scripts/generate-month.mjs <pdf> <YYYY-MM>");
  process.exit(2);
}
/* 认证走 SDK 自己解析环境变量，两种方式都支持：
     · WIF（GitHub Actions）：ANTHROPIC_FEDERATION_RULE_ID + ANTHROPIC_ORGANIZATION_ID
       + ANTHROPIC_SERVICE_ACCOUNT_ID（+ 可选 ANTHROPIC_WORKSPACE_ID）
       + ANTHROPIC_IDENTITY_TOKEN_FILE（GitHub 签发的 OIDC JWT）
     · API key：ANTHROPIC_API_KEY
   SDK 会拿 JWT 去换一个几分钟过期的短期 token，仓库里不存任何长期密钥。 */
const hasWIF = process.env.ANTHROPIC_FEDERATION_RULE_ID && process.env.ANTHROPIC_ORGANIZATION_ID;
if (!hasWIF && !process.env.ANTHROPIC_API_KEY) {
  console.error("没有可用的凭据：要么配好 WIF 的几个 ANTHROPIC_* 变量，要么给 ANTHROPIC_API_KEY");
  process.exit(2);
}
console.log(`认证方式：${hasWIF ? "Workload Identity Federation" : "API key"}`);
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";

const files = readdirSync(join(ROOT, "data")).filter((f) => /^lunch-\d{4}-\d{2}\.json$/.test(f)).sort();
const glossary = {};
for (const f of files) {
  const m = JSON.parse(readFileSync(join(ROOT, "data", f), "utf8"));
  for (const d of m.days) for (const it of d.items || []) if (it.en && it.zh) glossary[it.en] = it.zh;
}
const example = files.length ? readFileSync(join(ROOT, "data", files.at(-1)), "utf8") : "(无)";

const prompt = `这是 St. Mary's International School 的 Cezars Kitchen 午餐菜单 PDF，里面有好几个月，每月一页。

请只输出 **${month}** 那一页的数据，转成 JSON。其他月份一律忽略。

## 格式
照抄下面这个已有月份的结构（这是 ${files.at(-1) || ""}）：

${example}

## 规则
1. 每天七条 items，kind 顺序固定：main, veg, carb, side, salad, drink, dessert。
   PDF 每格从上到下就是这个顺序，第二行带 (V) 的是素食替代，去掉 "(V) " 前缀放进 veg。
   倒数第二行永远是 Drink，最后一行是甜点。
2. 只收工作日。整格写 NO SCHOOL / HOLIDAY 之类的，写成
   { "date": "...", "type": "closed", "label": "<英文原文>", "labelZh": "<中文>" }，不要 items。
3. 日期格上方若有活动名（如 Coconut Day、Halloween、World Teachers' Day），加 "event" 和 "eventZh"。
   ⚠️ 活动名旁边的数字有时是活动日而不是该格的日期——**日期一律以它在周一至周五哪一列为准**。
4. 过敏原抄那一格底部的大写标签，只用这些值：EGG DAIRY WHEAT SESAME SOY FISH SHELLFISH PEANUT NUT。
   kcal 和 protein 抄 Calorie / Protein 的数字。数字明显印错（比如多一位）时按合理值填，并加 "kcalNote" 说明。
5. 英文名照抄 PDF，但明显的拼写错误（如 Chiken → Chicken）改正。
6. 中文名：下面词典里有的**必须原样沿用**，没有的自己翻译，简体，简洁自然，菜名不要加引号或句号。

## 已有译名词典
${JSON.stringify(glossary, null, 0)}

只输出 JSON 本身，不要任何解释，不要代码块围栏。`;

const client = new Anthropic({ maxRetries: 3 });

let data;
try {
  data = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    messages: [{
      role: "user",
      content: [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: readFileSync(pdfPath).toString("base64"),
          },
        },
        { type: "text", text: prompt },
      ],
    }],
  });
} catch (e) {
  console.error(`调用失败：${e.status || ""} ${e.message}`);
  if (e.status === 401 || e.status === 403) {
    console.error("认证没过。WIF 的话检查 federation rule 的匹配条件是否covers 这个仓库和分支，以及 id-token: write 权限。");
  }
  process.exit(1);
}

if (data.stop_reason === "max_tokens") { console.error("输出被 max_tokens 截断"); process.exit(1); }
let text = data.content.filter((c) => c.type === "text").map((c) => c.text).join("").trim();
text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();

let parsed;
try { parsed = JSON.parse(text); }
catch (e) { console.error("返回的不是合法 JSON：" + e.message + "\n" + text.slice(0, 500)); process.exit(1); }

const r = validate(parsed, month);
for (const w of r.warns) console.log("⚠ " + w);
if (r.errs.length) {
  console.error(`✗ ${month} 校验不通过（${r.errs.length} 处）：`);
  for (const e of r.errs) console.error("  · " + e);
  process.exit(1);
}

const out = join(ROOT, "data", `lunch-${month}.json`);
writeFileSync(out, JSON.stringify(parsed, null, 2) + "\n");
console.log(`✓ ${out}`);
console.log(`  ${r.menuDays} 天菜单 + ${r.closed} 天停课；需自备主食 ${r.stapleWarn.length} 天`);

const knownNames = new Set(Object.keys(glossary));
const fresh = [];
for (const d of parsed.days) for (const it of d.items || []) if (!knownNames.has(it.en)) fresh.push(`${it.en} → ${it.zh}`);

if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import("node:fs");
  const summary = [
    `**${month}**：${r.menuDays} 天菜单，${r.closed} 天停课`,
    ``,
    `需要自备主食 ${r.stapleWarn.length} 天：${r.stapleWarn.join("、") || "无"}`,
    ``,
    `新出现的菜（${fresh.length} 道，译名请重点看）：`,
    ...fresh.map((s) => `- ${s}`),
  ].join("\n");
  appendFileSync(process.env.GITHUB_OUTPUT, `summary<<SUMEOF\n${summary}\nSUMEOF\n`);
}
console.log(`  新菜 ${fresh.length} 道`);
