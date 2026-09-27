#!/usr/bin/env node
/**
 * 扫描 data/lunch-YYYY-MM.json，生成 seed.generated.js。
 * 加新月份只要往 data/ 丢文件，不用改 smis-lunch.jsx。
 */
import { readdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");

const files = readdirSync(DATA)
  .filter((f) => /^lunch-\d{4}-\d{2}\.json$/.test(f))
  .sort();

if (!files.length) {
  console.error("data/ 里没有 lunch-YYYY-MM.json");
  process.exit(1);
}

for (const f of files) {
  const m = JSON.parse(readFileSync(join(DATA, f), "utf8"));
  const expect = f.slice(6, 13);
  if (m.month !== expect) {
    console.error(`${f}: 里面的 month 是 ${m.month}，和文件名对不上`);
    process.exit(1);
  }
}

const ids = files.map((f) => "m" + f.slice(6, 13).replace("-", "_"));
const out = `// 由 scripts/gen-seed.mjs 自动生成，不要手改
${files.map((f, i) => `import ${ids[i]} from "./data/${f}";`).join("\n")}

export const SEED = [${ids.join(", ")}];
export const SEED_VERSION = ${files.length};
`;

writeFileSync(join(ROOT, "seed.generated.js"), out);
console.log(`seed.generated.js → ${files.length} 个月：${files.map((f) => f.slice(6, 13)).join(", ")}`);
