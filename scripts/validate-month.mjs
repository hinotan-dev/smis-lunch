#!/usr/bin/env node
/**
 * 机械校验一个月份的 JSON。过不了就非零退出，Action 会改开 issue 而不是 PR。
 * 用法：node scripts/validate-month.mjs data/lunch-2026-11.json
 */
import { readFileSync } from "node:fs";

const KINDS = ["main", "veg", "carb", "side", "salad", "drink", "dessert"];
const ALLERGENS = new Set([
  "EGG", "DAIRY", "WHEAT", "SESAME", "SOY", "FISH", "SHELLFISH", "PEANUT", "NUT", "BUCKWHEAT",
]);
const CJK = /[㐀-鿿　-〿＀-￯]/;

export function validate(m, expectMonth) {
  const errs = [];
  const warns = [];
  const bad = (s) => errs.push(s);

  if (!m || typeof m !== "object") return { errs: ["不是一个对象"], warns };
  if (!/^\d{4}-\d{2}$/.test(m.month || "")) bad(`month 格式不对：${m.month}`);
  if (expectMonth && m.month !== expectMonth) bad(`month 是 ${m.month}，期望 ${expectMonth}`);
  if (!Array.isArray(m.days) || !m.days.length) return { errs: [...errs, "days 为空"], warns };

  const seen = new Set();
  let menuDays = 0;
  let prev = "";
  const stapleWarn = [];

  for (const d of m.days) {
    const at = (s) => bad(`${d.date || "?"}: ${s}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || "")) { bad(`日期格式不对：${d.date}`); continue; }
    if (!d.date.startsWith(m.month)) at("不属于本月");
    if (seen.has(d.date)) at("日期重复");
    seen.add(d.date);
    if (d.date < prev) at("日期没有按升序排列");
    prev = d.date;

    const dow = new Date(d.date + "T00:00:00Z").getUTCDay();
    if (dow === 0 || dow === 6) at("是周末，不该出现在菜单里");

    if (d.type === "closed") {
      if (!d.label || !d.labelZh) at("closed 缺 label / labelZh");
      continue;
    }
    if (d.type !== "menu") { at(`未知的 type：${d.type}`); continue; }
    menuDays++;

    if (!(d.kcal >= 400 && d.kcal <= 1600)) at(`kcal 超出合理范围：${d.kcal}`);
    if (!(d.protein >= 10 && d.protein <= 80)) at(`protein 超出合理范围：${d.protein}`);
    for (const a of d.allergens || []) if (!ALLERGENS.has(a)) at(`未知过敏原：${a}`);

    const kinds = (d.items || []).map((i) => i.kind);
    if (kinds.join(",") !== KINDS.join(",")) at(`items 的 kind 顺序不对：${kinds.join(",") || "(空)"}`);
    for (const it of d.items || []) {
      if (!it.en?.trim()) at(`${it.kind} 缺英文名`);
      if (!it.zh?.trim()) at(`${it.kind} 缺中文名（${it.en}）`);
      else if (!CJK.test(it.zh)) at(`${it.kind} 的 zh 里没有中文：${it.zh}`);
      if (it.zh && it.zh === it.en) at(`${it.kind} 的中英文一样，可能没译：${it.en}`);
    }

    const carb = (d.items || []).map((i) => i.en || "").join(" | ");
    const half = /half\s+rice/i.test(carb);
    const white = /white\s+rice/i.test(carb);
    if (!(white && !half)) stapleWarn.push(d.date);
  }

  if (menuDays < 14 || menuDays > 23) warns.push(`本月只有 ${menuDays} 天菜单，确认一下是否漏了`);
  return { errs, warns, menuDays, stapleWarn, closed: m.days.length - menuDays };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv[2];
  if (!path) { console.error("用法：node scripts/validate-month.mjs <json>"); process.exit(2); }
  const expect = path.match(/lunch-(\d{4}-\d{2})\.json$/)?.[1];
  const r = validate(JSON.parse(readFileSync(path, "utf8")), expect);
  for (const w of r.warns) console.log("⚠ " + w);
  if (r.errs.length) {
    console.error(`✗ ${r.errs.length} 处问题：`);
    for (const e of r.errs) console.error("  · " + e);
    process.exit(1);
  }
  console.log(`✓ ${r.menuDays} 天菜单 + ${r.closed} 天停课；需自备主食 ${r.stapleWarn.length} 天：${r.stapleWarn.join(", ")}`);
}
