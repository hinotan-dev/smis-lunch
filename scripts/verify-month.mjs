#!/usr/bin/env node
/**
 * 独立复核：让另一个模型重读 PDF，只抽「能和 PDF 逐字对照的事实字段」，
 * 和已生成的 JSON 机械比对，把不一致列进 PR 正文。
 *
 * 只查事实，不查译名——中文没有客观标准，而且词典已经保证了跨月一致性。
 * 查英文菜名是为了抓「整列错位」：一旦某天的菜串到了隔壁，英文名会立刻对不上，
 * 而这类错误单看日期和数字是发现不了的。
 *
 * 用法：node scripts/verify-month.mjs <pdf> <YYYY-MM>
 * 从不因为发现差异就退出非零——差异交给人看，复核本身也可能读错。
 */
import { readFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const [pdfPath, month] = process.argv.slice(2);
if (!pdfPath || !/^\d{4}-\d{2}$/.test(month || "")) {
  console.error("用法：node scripts/verify-month.mjs <pdf> <YYYY-MM>");
  process.exit(2);
}

const KINDS = ["main", "veg", "carb", "side", "salad", "dessert"];
const notesPath = process.env.PR_NOTES;
const note = (s) => { if (notesPath) appendFileSync(notesPath, s + "\n"); };

/* 比菜名时忽略大小写、标点和 w./with 之类的写法差异 */
const norm = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/\bw\.?\b/g, "with")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const generated = JSON.parse(readFileSync(join(ROOT, "data", `lunch-${month}.json`), "utf8"));

const prompt = `这是 St. Mary's International School 的 Cezars Kitchen 午餐菜单 PDF。

只看 **${month}** 那一页，把每个工作日的内容抄成 JSON 数组。其他月份忽略。

每天一个对象：
{"date":"YYYY-MM-DD","main":"","veg":"","carb":"","side":"","salad":"","dessert":"","allergens":["EGG"],"kcal":0,"protein":0}

整格写 NO SCHOOL / HOLIDAY 的日子，只输出 {"date":"YYYY-MM-DD","closed":true}。

规则：
- 菜名**照抄 PDF 的英文原文**，不要翻译，不要修正拼写，不要改写。第二行的 "(V) " 前缀去掉后放进 veg。
- 每格从上到下依次是 main、veg、carb、side、salad、Drink（跳过不要）、dessert。
- allergens 抄那一格底部的大写标签；kcal 和 protein 抄 Calorie / Protein 的数字。
- ⚠️ 日期以格子在周一至周五哪一列为准，不要被格子里写的活动名或数字带偏。

只输出 JSON 数组，不要解释，不要代码块围栏。`;

const model = process.env.VERIFY_MODEL || "claude-sonnet-5";
console.log(`复核模型：${model}（生成用的是 ${process.env.CLAUDE_MODEL || "claude-opus-5"}）`);

let ref;
try {
  /* VERIFY_REF 指向本地 JSON 时跳过调用，用来离线验证比对逻辑 */
  if (process.env.VERIFY_REF) {
    ref = JSON.parse(readFileSync(process.env.VERIFY_REF, "utf8"));
    console.log(`用本地复核结果：${process.env.VERIFY_REF}`);
    if (!Array.isArray(ref)) throw new Error("复核返回的不是数组");
  } else {
  const res = await new Anthropic({ maxRetries: 3 }).messages.create({
    model,
    max_tokens: 8000,
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: readFileSync(pdfPath).toString("base64") } },
        { type: "text", text: prompt },
      ],
    }],
  });
  if (res.stop_reason === "max_tokens") throw new Error("复核输出被截断");
  const text = res.content.filter((c) => c.type === "text").map((c) => c.text).join("")
    .trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  ref = JSON.parse(text);
  if (!Array.isArray(ref)) throw new Error("复核返回的不是数组");
  }
} catch (e) {
  console.error(`复核没跑成：${e.message}`);
  note(`> ⚠️ **${month} 的独立复核没能完成**（${e.message}），这次只过了机械校验，合并前请自己扫一眼过敏原和热量。`);
  process.exit(0);   // 复核失败不挡 PR
}

const byDate = new Map(ref.map((d) => [d.date, d]));
const diffs = [];

for (const day of generated.days) {
  const r = byDate.get(day.date);
  if (!r) { diffs.push(`\`${day.date}\` 复核里没有这一天`); continue; }

  if (day.type === "closed") {
    if (!r.closed) diffs.push(`\`${day.date}\` 生成为停课，复核认为有菜单`);
    continue;
  }
  if (r.closed) { diffs.push(`\`${day.date}\` 生成为有菜单，复核认为停课`); continue; }

  for (const k of KINDS) {
    const a = day.items?.find((i) => i.kind === k)?.en;
    if (norm(a) !== norm(r[k])) diffs.push(`\`${day.date}\` ${k}：生成「${a ?? "(无)"}」／复核「${r[k] ?? "(无)"}」`);
  }

  const ga = [...new Set(day.allergens || [])].sort();
  const ra = [...new Set((r.allergens || []).map((x) => String(x).toUpperCase().replace(/\s+/g, "")))].sort();
  if (ga.join(",") !== ra.join(",")) {
    diffs.push(`\`${day.date}\` **过敏原**：生成 ${ga.join("、") || "(无)"} ／ 复核 ${ra.join("、") || "(无)"}`);
  }

  if (Number(day.kcal) !== Number(r.kcal)) diffs.push(`\`${day.date}\` kcal：生成 ${day.kcal} ／ 复核 ${r.kcal}`);
  if (Math.abs(Number(day.protein) - Number(r.protein)) > 0.05) {
    diffs.push(`\`${day.date}\` 蛋白质：生成 ${day.protein} ／ 复核 ${r.protein}`);
  }
}

for (const d of ref) if (!generated.days.some((g) => g.date === d.date)) diffs.push(`\`${d.date}\` 生成里没有这一天`);

if (!diffs.length) {
  console.log(`✓ ${month} 复核一致`);
  note(`> ✅ **${month} 独立复核一致**（${model} 重读 PDF，逐项核对了英文菜名、过敏原、热量、蛋白质）。`);
} else {
  console.log(`⚠ ${month} 有 ${diffs.length} 处不一致：`);
  for (const d of diffs) console.log("  · " + d.replace(/[`*]/g, ""));
  note(`> ⚠️ **${month} 独立复核发现 ${diffs.length} 处不一致，合并前请逐条确认**（复核由 ${model} 重读 PDF 得出，也可能是复核读错）：`);
  note("");
  for (const d of diffs) note(`> - ${d}`);
}
note("");
