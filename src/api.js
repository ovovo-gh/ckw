const KEY = "chiikawa-space-session-v1";
export let token = localStorage.getItem(KEY) || "";
export function setToken(value) {
  token = value;
  if (value) localStorage.setItem(KEY, value);
  else localStorage.removeItem(KEY);
  clearMedia();
}
export async function api(action, body = {}) {
  const data = { action, ...body, token };
  let result;
    let response;
    try {
      response = await fetch(import.meta.env.VITE_API_URL || "/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch {
      throw Error("连接中断，请检查网络后重试");
    }
    try {
      result = await response.json();
    } catch {
      throw Error("服务暂时不可用，请稍后重试");
    }
  if (!result?.ok) {
    const e = new Error(result?.error || "操作失败，请重试");
    e.status = result?.status;
    throw e;
  }
  return result.data;
}
const media = new Map();
export function clearMedia() {
  for (const v of media.values())
    v.then((u) => URL.revokeObjectURL(u)).catch(() => {});
  media.clear();
}
export async function mediaURL(id) {
  const key = token + ":" + id;
  if (!media.has(key))
    media.set(
      key,
      api("media", { id })
        .then(({ mime, base64 }) =>
          URL.createObjectURL(base64Blob(base64, mime)),
        )
        .catch((e) => {
          media.delete(key);
          throw e;
        }),
    );
  return media.get(key);
}
export function base64Blob(base64, mime) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}
export async function upload(file, { wallpaper = false } = {}) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error("请先将照片转为 JPG、PNG 或 WebP（暂不支持 HEIC）");
  if (file.size > 25 * 1024 * 1024) throw Error("图片不能超过 25 MB");
  let blob = file;
  const src = URL.createObjectURL(file);
  let width, height;
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    width = img.naturalWidth;
    height = img.naturalHeight;
    if (!wallpaper) {
      const scale = Math.min(1, 1600 / Math.max(width, height));
      const c = document.createElement("canvas");
      c.width = Math.round(width * scale);
      c.height = Math.round(height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
      if (!blob) throw Error("图片处理失败");
    }
  } finally {
    URL.revokeObjectURL(src);
  }
  if (blob.size > 3 * 1024 * 1024)
    throw Error("测试版单张原图上限 3 MB，请选择更小的图片");
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const result = await api("upload", { base64, mime: blob.type });
  return { ...result, width, height };
}
export function downloadBlob(blob, name) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 10000);
}
export async function backup(onProgress) {
  const data = await api("export");
  const { zipSync, strToU8 } = await import("fflate");
  const files = { "收藏数据.json": strToU8(JSON.stringify(data, null, 2)) };
  const ids = [
    ...new Set(
      [...data.collections, ...data.variants, ...data.wallpapers].flatMap(
        (x) => x.images || [],
      ),
    ),
  ];
  let total = 0;
  for (let i = 0; i < ids.length; i++) {
    onProgress(`${i + 1} / ${ids.length}`);
    const { base64, mime } = await api("media", { id: ids[i] });
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    total += bytes.length;
    if (total > 200 * 1024 * 1024)
      throw Error("图片备份超过 200 MB，请联系站点主人进行服务器备份");
    files[`照片/${ids[i]}.${mime.split("/")[1]}`] = bytes;
  }
  files["说明.txt"] = strToU8(
    "此备份包含私人价格、备注和上传照片，请妥善保管。官方图鉴和壁纸的原始来源保存在收藏数据.json 中。",
  );
  downloadBlob(
    new Blob([zipSync(files, { level: 0 })], { type: "application/zip" }),
    `chiikawa-space-${new Date().toISOString().slice(0, 10)}.zip`,
  );
}
