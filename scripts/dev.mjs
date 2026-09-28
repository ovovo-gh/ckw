import { spawn } from "node:child_process";
const a = spawn(process.execPath, ["backend/local.mjs"], { stdio: "inherit" });
const b = spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
  stdio: "inherit",
});
const stop = () => {
  a.kill();
  b.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
a.on("exit", (code) => {
  b.kill();
  process.exit(code ?? 0);
});
b.on("exit", (code) => {
  a.kill();
  process.exit(code ?? 0);
});
