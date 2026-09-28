import { mkdir, copyFile, writeFile, cp, readFile, chmod } from "node:fs/promises";
await mkdir(".deploy/functions/space", { recursive: true });
for (const file of ["core.mjs", "store.mjs", "seed.json", "index.js"])
  await copyFile("backend/" + file, ".deploy/functions/space/" + file);
await writeFile(
  ".deploy/functions/space/package.json",
  JSON.stringify(
    {
      name: "chiikawa-space-api",
      version: "1.0.0",
      private: true,
      dependencies: { "@cloudbase/js-sdk": "3.10.1", "@cloudbase/signature-nodejs": "^2.0.0" },
    },
    null,
    2,
  ),
);
await writeFile(
  ".deploy/cloudbaserc.json",
  JSON.stringify(
    {
      envId: process.env.CLOUDBASE_ENV || "REPLACE_WITH_FREE_ENV_ID",
      functionRoot: "functions",
      functions: [
        {
          name: "space",
          handler: "index.main",
          runtime: "Nodejs20.19",
          memorySize: 256,
          timeout: 60,
          installDependency: true,
          envVariables: { SPACE_ENV_ID: process.env.CLOUDBASE_ENV, CLOUDBASE_APIKEY: JSON.parse(await readFile(".local/cloudbase-backend-key.json", "utf8")).data.ApiKey, SPACE_ACCOUNTS_B64: (await readFile(".local/accounts.json")).toString("base64") },
        },
      ],
    },
    null,
    2,
  ),
);
await chmod(".deploy/cloudbaserc.json", 0o600);
await cp("dist", ".deploy/web", { recursive: true });
console.log(
  "已生成 .deploy/（含服务端秘密，不可公开）。HTTP API、数据权限和部署步骤见 docs/部署.md。",
);
