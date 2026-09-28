import { readFile, writeFile, mkdir } from "node:fs/promises";
const seed = JSON.parse(await readFile("backend/seed.json", "utf8"));
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const rows = [];
for (const [key, kind] of [
  ["series", "series"],
  ["variants", "variant"],
  ["wallpapers", "wallpaper"],
]) {
  for (const item of seed[key]) {
    const body = {
      ...item,
      kind,
      rev: 1,
      createdAt: new Date().toISOString(),
      seeded: true,
    };
    rows.push(
      `(${quote(kind + "_" + item.id)},${quote(kind)},${quote(JSON.stringify(body))}::jsonb,1)`,
    );
  }
}
rows.push(`('meta_seed_v1','meta','{"kind":"meta","version":1}'::jsonb,1)`);
await mkdir(".deploy", { recursive: true });
await writeFile(
  ".deploy/seed.sql",
  "INSERT INTO public.chiikawa_records (id,kind,body,version) VALUES\n" +
    rows.join(",\n") +
    "\nON CONFLICT (id) DO NOTHING;\n",
);
console.log("已生成可重复执行的图鉴与壁纸初始化 SQL。");
