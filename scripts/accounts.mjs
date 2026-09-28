import { mkdir, writeFile, access } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { makeAccount } from "../backend/core.mjs";
await mkdir(".local", { recursive: true });
try {
  await access(".local/accounts.json");
  console.log("账号已存在。账号文件保存在 .local/，不会进入 GitHub。");
  process.exit(0);
} catch {}
const users = [
  ["gonghan", "我"],
  ["love", "她"],
];
const credentials = users.map(([username, label]) => ({
  username,
  label,
  password: randomBytes(6).toString("base64url"),
}));
const accounts = await Promise.all(
  credentials.map((c) => makeAccount(c.username, c.password, c.label)),
);
await writeFile(".local/accounts.json", JSON.stringify(accounts), {
  mode: 0o600,
});
await writeFile(
  ".local/测试账号.txt",
  credentials
    .map((c) => `${c.label}\n账号：${c.username}\n密码：${c.password}`)
    .join("\n\n") + "\n\n仅供你们两人使用，勿提交到仓库。\n",
  { mode: 0o600 },
);
console.log(
  "已生成两个测试账号，查看 .local/测试账号.txt。云端只配置 accounts.json 中的密码哈希。",
);
