import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { LocalStore } from "./store.mjs";
import { createService } from "./core.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let accounts;
try {
  accounts = JSON.parse(
    await readFile(path.join(root, ".local/accounts.json"), "utf8"),
  );
} catch {
  console.error("请先运行 npm run accounts 生成本地测试账号");
  process.exit(1);
}
const seed = JSON.parse(
  await readFile(path.join(root, "backend/seed.json"), "utf8"),
);
const handle = createService({
  store: new LocalStore(path.join(root, ".local/data")),
  accounts,
  seed,
});
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".json": "application/json",
};
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.url === "/api" && req.method === "POST") {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    try {
      let chunks = [],
        size = 0;
      for await (const part of req) {
        size += part.length;
        if (size > 4.2 * 1024 * 1024) {
          res.statusCode = 413;
          res.end(JSON.stringify({ ok: false, error: "图片过大" }));
          return;
        }
        chunks.push(part);
      }
      const result = await handle(JSON.parse(Buffer.concat(chunks).toString()));
      res.statusCode = result.ok ? 200 : result.status;
      res.end(JSON.stringify(result));
    } catch {
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, error: "请求格式无效" }));
    }
    return;
  }
  if (req.method !== "GET") {
    res.writeHead(405).end();
    return;
  }
  const dist = path.join(root, "dist");
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    let file = path.resolve(dist, "." + pathname);
    if (!file.startsWith(dist + path.sep)) {
      res.writeHead(404).end();
      return;
    }
    if (!path.extname(file)) file = path.join(dist, "index.html");
    const bytes = await readFile(file);
    res.setHeader(
      "Content-Type",
      types[path.extname(file)] || "application/octet-stream",
    );
    res.end(bytes);
  } catch {
    res.writeHead(404).end("Not found");
  }
});
server.listen(Number(process.env.PORT) || 8787, "127.0.0.1", () =>
  console.log(
    `chiikawa space backend: http://127.0.0.1:${Number(process.env.PORT) || 8787}`,
  ),
);
