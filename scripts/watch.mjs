#!/usr/bin/env node
/** 盯着源码，改了就自动重新打包。调样式时开着它，改完存盘刷新浏览器就行。 */
import { watch } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGETS = ["smis-lunch.jsx", "shell.html", "data"];

let timer = null;
let running = false;
let again = false;

function build() {
  if (running) { again = true; return; }
  running = true;
  execFile(process.execPath, [join(ROOT, "scripts/build.mjs")], (err, stdout, stderr) => {
    running = false;
    const t = new Date().toTimeString().slice(0, 8);
    if (err) {
      console.error(`\n[${t}] ✗ 打包失败\n${stderr || stdout}`);
    } else {
      console.log(`[${t}] ✓ ${stdout.trim().split("\n").pop()}`);
    }
    if (again) { again = false; build(); }
  });
}

for (const t of TARGETS) {
  watch(join(ROOT, t), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(build, 150);   // 编辑器保存常常触发多次，防抖
  });
}

console.log(`盯着 ${TARGETS.join("、")}，改动后自动重新打包。Ctrl+C 退出。`);
console.log(`浏览器打开：file://${join(ROOT, "index.html")}`);
build();
