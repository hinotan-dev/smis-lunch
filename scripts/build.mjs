#!/usr/bin/env node
/** gen-seed → esbuild 打包 → 把 bundle 内联进 shell.html，写出 index.html。 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import * as esbuild from "esbuild";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

execFileSync(process.execPath, [join(ROOT, "scripts/gen-seed.mjs")], { stdio: "inherit" });

const res = await esbuild.build({
  entryPoints: [join(ROOT, "smis-lunch.jsx")],
  bundle: true,
  minify: true,
  write: false,
  loader: { ".json": "json" },
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "none",
});

const code = res.outputFiles[0].text;
if (code.includes("</script")) throw new Error("bundle 里出现了 </script，会截断 HTML");

const shell = readFileSync(join(ROOT, "shell.html"), "utf8");
if (!shell.includes("__BUNDLE__")) throw new Error("shell.html 里找不到 __BUNDLE__ 占位符");

const html = shell.replace("__BUNDLE__", () => code);
writeFileSync(join(ROOT, "index.html"), html);
console.log(`index.html → ${Math.round(Buffer.byteLength(html) / 1024)}KB`);
