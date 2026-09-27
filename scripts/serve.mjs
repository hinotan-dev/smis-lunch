#!/usr/bin/env node
/**
 * 本地开发服务器：静态托管 + 监听源码 + 打包完自动刷新浏览器。
 *
 * 自动刷新的脚本是**发送时临时注入**的，不写进 index.html，
 * 所以提交到仓库里的产物永远是干净的。
 *
 * 默认监听所有网卡，会打印一个局域网地址——手机连同一个 Wi-Fi 就能打开，
 * 这个 app 是手机优先的，在真机上看比缩放浏览器窗口准得多。
 * 只想本机访问就 HOST=127.0.0.1 npm run dev。
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { watch } from "node:fs";
import { join, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { networkInterfaces } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || "0.0.0.0";
const WATCHED = ["smis-lunch.jsx", "shell.html", "data"];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".css": "text/css; charset=utf-8",
};

const RELOAD_SNIPPET = `<script>
(function(){
  var es = new EventSource("/__reload");
  es.onmessage = function(){ location.reload(); };
  es.onerror = function(){ /* 服务器重启时浏览器会自己重连 */ };
})();
</script>`;

const clients = new Set();
const stamp = () => new Date().toTimeString().slice(0, 8);

let running = false;
let again = false;

function build() {
  if (running) { again = true; return; }
  running = true;
  execFile(process.execPath, [join(ROOT, "scripts/build.mjs")], (err, stdout, stderr) => {
    running = false;
    if (err) {
      console.error(`[${stamp()}] ✗ 打包失败，浏览器不刷新\n${(stderr || stdout).trim()}`);
    } else {
      console.log(`[${stamp()}] ✓ ${stdout.trim().split("\n").pop()}  → 已通知 ${clients.size} 个页面刷新`);
      for (const res of clients) res.write("data: reload\n\n");
    }
    if (again) { again = false; build(); }
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/__reload") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write(": connected\n\n");
    clients.add(res);
    const ka = setInterval(() => res.write(": ping\n\n"), 30000);
    req.on("close", () => { clearInterval(ka); clients.delete(res); });
    return;
  }

  /* 把请求路径夹在 ROOT 里面，防止 ../ 跑出去 */
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ""));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end("nope"); return; }

  try {
    const body = await readFile(file);
    const ext = extname(file).toLowerCase();
    if (ext === ".html") {
      const html = body.toString("utf8").replace("</body>", RELOAD_SNIPPET + "\n</body>");
      res.writeHead(200, { "content-type": TYPES[ext], "cache-control": "no-store" });
      res.end(html);
    } else {
      res.writeHead(200, { "content-type": TYPES[ext] || "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    }
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("404 " + p);
  }
});

for (const t of WATCHED) {
  let timer = null;
  watch(join(ROOT, t), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(build, 150);   // 编辑器保存常触发多次事件，防抖
  });
}

server.listen(PORT, HOST, () => {
  const lan = Object.values(networkInterfaces()).flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => n.address);
  console.log(`\n  本机   http://localhost:${PORT}`);
  for (const ip of lan) console.log(`  手机   http://${ip}:${PORT}   （同一个 Wi-Fi）`);
  console.log(`\n  盯着 ${WATCHED.join("、")}，改动后自动打包并刷新页面。Ctrl+C 退出。\n`);
  build();
});
