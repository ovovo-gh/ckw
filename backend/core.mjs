import {
  randomBytes,
  randomUUID,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export async function makeAccount(username, password, label) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)).toString("hex");
  return { username, label, salt, hash };
}
class Fault extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const fail = (message, status = 400) => {
  throw new Fault(message, status);
};
const idOK = (id) =>
  typeof id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
const text = (v, max = 200) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const url = (v) => {
  const s = text(v, 1500);
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") fail("来源网址需要以 https:// 开头");
    return u.href;
  } catch {
    fail("请填写有效的来源网址");
  }
};
const fields = (obj, names) =>
  Object.fromEntries(
    names.map((k) => [k, obj[k]]).filter(([, v]) => v !== undefined),
  );
export const kinds = ["collection", "series", "variant", "wallpaper"];
const validMime = new Set(["image/jpeg", "image/png", "image/webp"]);
function mimeOf(b) {
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return "";
}
const imageRefs = (v) => {
  if (!Array.isArray(v) || v.length > 8) fail("最多添加 8 张照片");
  return v.map((x) => {
    if (!idOK(x)) fail("图片编号无效");
    return x;
  });
};

export function createService({
  store,
  accounts,
  seed = { series: [], variants: [], wallpapers: [] },
  now = () => Date.now(),
}) {
  const accountMap = new Map(accounts.map((a) => [a.username, a]));
  let init;
  function initialize() {
    return (init ??= (async () => {
      if (await store.get("meta_seed_v1")) return;
      for (const [key, kind] of [
        ["series", "series"],
        ["variants", "variant"],
        ["wallpapers", "wallpaper"],
      ])
        for (const item of seed[key] || [])
          await store.mutate(
            `${kind}_${item.id}`,
            (old) =>
              old ?? {
                ...item,
                kind,
                rev: 1,
                createdAt: new Date(now()).toISOString(),
                seeded: true,
              },
          );
      await store.mutate("meta_seed_v1", () => ({ kind: "meta", version: 1 }));
    })().catch((e) => {
      init = null;
      throw e;
    }));
  }
  async function userFor(token) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
    const session = await store.get("session_" + digest(token));
    if (!session || session.expires < now()) return null;
    const account = accountMap.get(session.username);
    if (!account || session.fingerprint !== digest(account.hash)) return null;
    return {
      username: account.username,
      label: account.label,
      sessionId: "session_" + digest(token),
    };
  }
  async function snapshot(user) {
    const [collections, series, variants, wallpapers, wishes] =
      await Promise.all(
        ["collection", "series", "variant", "wallpaper", "wish"].map(
          async (k) => (await store.list(k)).filter((r) => !r.deleted),
        ),
      );
    return {
      user: user ? fields(user, ["username", "label"]) : null,
      collections: collections
        .filter((r) => user || !r.private)
        .map((r) =>
          user
            ? strip(r)
            : fields(r, [
                "id",
                "rev",
                "name",
                "character",
                "category",
                "status",
                "images",
                "variantId",
                "createdAt",
              ]),
        ),
      series: series.map(strip),
      variants: variants.map(strip),
      wallpapers: wallpapers.map(strip),
      wishes: user ? wishes.map(strip) : [],
    };
  }
  function strip(obj) {
    const { _id, kind, ...rest } = obj;
    return rest;
  }
  async function validate(kind, data, id) {
    const out = { name: text(data.name) };
    if (!out.name) fail("请填写名称");
    if (kind === "collection") {
      Object.assign(out, {
        character: text(data.character, 50),
        category: text(data.category, 50) || "玩偶",
        status: data.status === "ordered" ? "ordered" : "arrived",
        private: data.private === true,
        notes: text(data.notes, 3000),
        purchaseDate: text(data.purchaseDate, 10),
        channel: text(data.channel, 200),
        variantId: text(data.variantId, 100),
        images: imageRefs(data.images || []),
      });
      if (
        out.purchaseDate &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(out.purchaseDate) ||
          !Number.isFinite(Date.parse(out.purchaseDate)) ||
          new Date(out.purchaseDate).toISOString().slice(0, 10) !==
            out.purchaseDate)
      )
        fail("购买日期无效");
      out.price =
        data.price === "" || data.price === null || data.price === undefined
          ? null
          : Number(data.price);
      if (
        out.price !== null &&
        (!Number.isFinite(out.price) || out.price < 0 || out.price > 1e7)
      )
        fail("价格应为 0 到 1000 万元之间的数字");
      if (out.price !== null) out.price = Math.round(out.price * 100) / 100;
      if (out.variantId) {
        const v = await store.get("variant_" + out.variantId);
        if (!v || v.deleted) fail("关联款式不存在");
      }
    } else if (kind === "series")
      Object.assign(out, {
        description: text(data.description, 1000),
        sourceUrl: url(data.sourceUrl),
      });
    else if (kind === "variant") {
      Object.assign(out, {
        seriesId: text(data.seriesId, 100),
        character: text(data.character, 50),
        originalName: text(data.originalName, 300),
        sourceUrl: url(data.sourceUrl),
        images: imageRefs(data.images || []),
      });
      const series = await store.get("series_" + out.seriesId);
      if (!series || series.deleted) fail("请选择有效的系列");
    } else if (kind === "wallpaper") {
      Object.assign(out, {
        device: ["phone", "desktop", "tablet"].includes(data.device)
          ? data.device
          : "phone",
        sourceUrl: url(data.sourceUrl),
        author: text(data.author, 100),
        images: imageRefs(data.images || []),
        width: Number(data.width) || 0,
        height: Number(data.height) || 0,
        license: text(data.license, 300) || "用户上传 · 请保留原作者信息",
        sourceOnly: false,
      });
      const existing = await store.get("wallpaper_" + id);
      if (!out.images.length && !existing?.image) fail("请上传一张壁纸");
      out.sourceOnly = !out.images.length && existing?.sourceOnly === true;
      out.compatibleDevices =
        out.device === "desktop" ? ["desktop", "tablet"] : [out.device];
    }
    for (const imageId of out.images || []) {
      const media = await store.get("media_" + imageId);
      if (!media) fail("图片不存在，请重新上传");
      if (media.ownerId && media.ownerId !== `${kind}_${id}`)
        fail("图片已关联其他记录，请重新上传");
    }
    return out;
  }
  return async function handle(input) {
    try {
      if (!input || typeof input !== "object") fail("无效请求");
      const { action, token } = input;
      await initialize();
      const user = await userFor(token);
      if (action === "snapshot")
        return { ok: true, data: await snapshot(user) };
      if (action === "login") {
        if (accounts.length !== 2)
          fail("维护者账号尚未配置，请联系站点主人", 503);
        const username = text(input.username, 60).toLowerCase();
        const account = accountMap.get(username);
        // A single unknown-user bucket prevents unlimited attacker-created documents.
        const bucket = "attempt_" + digest(account ? username : "unknown");
        await store.mutate(bucket, (old) => {
          const r =
            old && old.until > now()
              ? old
              : { kind: "attempt", count: 0, until: now() + 600000 };
          if (r.count >= 8) fail("尝试次数较多，请 10 分钟后再试", 429);
          return { ...r, count: r.count + 1 };
        });
        const salt = account?.salt ?? "00000000000000000000000000000000";
        const supplied = await scrypt(
          typeof input.password === "string"
            ? input.password.slice(0, 200)
            : "",
          salt,
          64,
        );
        if (
          !account ||
          !timingSafeEqual(supplied, Buffer.from(account.hash, "hex"))
        )
          fail("账号或密码不正确", 401);
        await store.mutate(bucket, () => null);
        const newToken = randomBytes(32).toString("hex");
        await store.mutate("session_" + digest(newToken), () => ({
          kind: "session",
          username,
          fingerprint: digest(account.hash),
          expires: now() + 14 * 86400000,
        }));
        return {
          ok: true,
          data: { token: newToken, user: { username, label: account.label } },
        };
      }
      if (action === "media") {
        if (!idOK(input.id)) fail("图片不存在", 404);
        const media = await store.get("media_" + input.id);
        if (!media) fail("图片不存在", 404);
        const owner = media.ownerId ? await store.get(media.ownerId) : null;
        if (owner && (owner.deleted || !owner.images?.includes(input.id)))
          fail("图片不存在", 404);
        if (!user && (!owner || (owner.kind === "collection" && owner.private)))
          fail("图片不存在", 404);
        // Once an owner is deleted, its images cannot be retrieved even by guessed public URLs.
        if (media.ownerId && !owner) fail("图片不存在", 404);
        const bytes = await store.getFile(media.storageId);
        return {
          ok: true,
          data: { mime: media.mime, base64: bytes.toString("base64") },
        };
      }
      if (!user) fail("请先登录", 401);
      if (action === "logout") {
        await store.mutate(user.sessionId, () => null);
        return { ok: true };
      }
      if (action === "export")
        return {
          ok: true,
          data: {
            version: 1,
            exportedAt: new Date(now()).toISOString(),
            ...(await snapshot(user)),
          },
        };
      if (action === "upload") {
        if (
          typeof input.base64 !== "string" ||
          input.base64.length > 4 * 1024 * 1024 ||
          !validMime.has(input.mime)
        )
          fail("请选择不超过 3 MB 的 JPG、PNG 或 WebP 图片");
        const bytes = Buffer.from(input.base64, "base64");
        if (
          !bytes.length ||
          bytes.length > 3 * 1024 * 1024 ||
          mimeOf(bytes) !== input.mime
        )
          fail("图片格式或大小不符合要求");
        const id = randomUUID();
        const storageId = await store.putFile(id, bytes);
        await store.mutate("media_" + id, () => ({
          kind: "media",
          id,
          storageId,
          mime: input.mime,
          createdAt: new Date(now()).toISOString(),
        }));
        return { ok: true, data: { id } };
      }
      if (action === "wish") {
        if (!idOK(input.variantId)) fail("款式不存在", 404);
        const variant = await store.get("variant_" + input.variantId);
        if (!variant || variant.deleted) fail("款式不存在", 404);
        await store.mutate("wish_" + input.variantId, () =>
          input.wanted
            ? { kind: "wish", id: input.variantId, variantId: input.variantId }
            : null,
        );
        return { ok: true };
      }
      if (action === "save") {
        if (!kinds.includes(input.kind)) fail("未知类型");
        const kind = input.kind,
          id = input.id ?? randomUUID();
        if (!idOK(id)) fail("编号无效");
        const data = await validate(kind, input.data ?? {}, id);
        const result = await store.mutate(`${kind}_${id}`, (old) => {
          if (old?.deleted) fail("记录已被删除，请刷新", 409);
          if (old && input.rev !== old.rev)
            fail("这条记录已被更新，请刷新后再编辑", 409);
          if (!old && input.id) fail("记录已被删除，请刷新", 409);
          // Seeded factual image/source metadata survives edits; user fields remain validated.
          const preserved = old
            ? fields(old, [
                "image",
                "originalImageUrl",
                "seeded",
                "sourceOnly",
                "width",
                "height",
                "license",
                "author",
              ])
            : {};
          return {
            ...preserved,
            ...data,
            id,
            kind,
            rev: (old?.rev ?? 0) + 1,
            createdAt: old?.createdAt ?? new Date(now()).toISOString(),
            updatedAt: new Date(now()).toISOString(),
            updatedBy: user.username,
          };
        });
        for (const mediaId of result.images || [])
          await store.mutate("media_" + mediaId, (old) => ({
            ...old,
            ownerId: `${kind}_${id}`,
          }));
        // Old attachments are unlinked; visibility checks also require the owner to list the image.
        return { ok: true, data: strip(result) };
      }
      if (action === "delete") {
        if (!kinds.includes(input.kind) || !idOK(input.id)) fail("记录无效");
        if (
          input.kind === "series" &&
          (await store.list("variant")).some(
            (v) => !v.deleted && v.seriesId === input.id,
          )
        )
          fail("此系列还有款式，请先移动或删除款式", 409);
        if (
          input.kind === "variant" &&
          (await store.list("collection")).some(
            (v) => !v.deleted && v.variantId === input.id,
          )
        )
          fail("有收藏关联此款式，请先解除关联", 409);
        await store.mutate(`${input.kind}_${input.id}`, (old) => {
          if (!old) fail("记录不存在", 404);
          if (old.rev !== input.rev) fail("记录已被更新，请刷新后再删除", 409);
          return { ...old, deleted: true, rev: old.rev + 1 };
        });
        if (input.kind === "variant")
          await store.mutate("wish_" + input.id, () => null);
        return { ok: true };
      }
      fail("未知操作");
    } catch (error) {
      if (error instanceof Fault)
        return { ok: false, status: error.status, error: error.message };
      console.error("Request failed:", error.message);
      return {
        ok: false,
        status: 500,
        error: "暂时无法保存或读取，请稍后重试",
      };
    }
  };
}
