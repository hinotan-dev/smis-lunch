#!/usr/bin/env node
/**
 * 下载 Cezars 的 PDF，读出里面有哪几个月，跟 data/ 里已有的比。
 * 这个 PDF 是滚动多月文件（同时含当月和前两个月），所以按「月份标题」比，不是比文件哈希。
 *
 * 输出：GitHub Actions 的 outputs —— missing（空格分隔的 YYYY-MM）、pdf（下载到的路径）
 */
import { readdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const URL_PDF = process.env.MENU_URL || "https://powerschool.smis.ac.jp/public/cezars.pdf";
const TMP = join(ROOT, ".tmp");

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

// MENU_PDF 指向本地文件时跳过下载（调试 / 学校站点抽风时手动喂一份）
let buf;
if (process.env.MENU_PDF) {
  buf = readFileSync(process.env.MENU_PDF);
  console.log(`用本地文件：${process.env.MENU_PDF}`);
} else {
  const res = await fetch(URL_PDF, { headers: { "user-agent": "smis-lunch-bot" } });
  if (!res.ok) { console.error(`下载失败：HTTP ${res.status}`); process.exit(1); }
  buf = Buffer.from(await res.arrayBuffer());
}
if (buf.subarray(0, 4).toString() !== "%PDF") { console.error("下载到的不是 PDF"); process.exit(1); }

if (!existsSync(TMP)) mkdirSync(TMP);
const pdfPath = join(TMP, "cezars.pdf");
writeFileSync(pdfPath, buf);

const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;

const found = new Set();
for (let i = 1; i <= doc.numPages; i++) {
  const text = (await (await doc.getPage(i)).getTextContent()).items.map((t) => t.str).join(" ");
  const m = text.match(new RegExp(`(${MONTHS.join("|")})\\s+(20\\d{2})`));
  if (m) found.add(`${m[2]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, "0")}`);
}

const have = new Set(
  readdirSync(join(ROOT, "data"))
    .filter((f) => /^lunch-\d{4}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(6, 13))
);
const missing = [...found].filter((m) => !have.has(m)).sort();

console.log(`PDF 里有：${[...found].sort().join(", ") || "(没识别出月份)"}`);
console.log(`已有：${[...have].sort().join(", ")}`);
console.log(`缺：${missing.join(", ") || "(无)"}`);

if (!found.size) { console.error("一个月份标题都没认出来，PDF 版式可能变了"); process.exit(3); }

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `missing=${missing.join(" ")}\npdf=${pdfPath}\n`);
}
