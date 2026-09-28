import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";

// One process owns the local store. Every mutation is serialized and atomically renamed.
export class LocalStore {
  constructor(root) {
    this.root = root;
    this.queue = Promise.resolve();
  }
  async read() {
    try {
      return JSON.parse(
        await readFile(path.join(this.root, "state.json"), "utf8"),
      );
    } catch (e) {
      if (e.code === "ENOENT") return {};
      throw e;
    }
  }
  async get(id) {
    await this.queue;
    return (await this.read())[id] ?? null;
  }
  async list(kind) {
    await this.queue;
    return Object.values(await this.read()).filter((x) => x.kind === kind);
  }
  async mutate(id, fn) {
    const task = this.queue.then(async () => {
      const all = await this.read();
      const next = await fn(all[id] ?? null);
      if (next === null) delete all[id];
      else all[id] = next;
      await mkdir(this.root, { recursive: true });
      const f = path.join(this.root, "state.json");
      await writeFile(f + ".tmp", JSON.stringify(all), { mode: 0o600 });
      await rename(f + ".tmp", f);
      return next;
    });
    this.queue = task.catch(() => {});
    return task;
  }
  async putFile(id, bytes) {
    await mkdir(path.join(this.root, "files"), { recursive: true });
    await writeFile(path.join(this.root, "files", id), bytes, { mode: 0o600 });
    return id;
  }
  async getFile(id) {
    return readFile(path.join(this.root, "files", id));
  }
}

// PostgreSQL rows use conditional version writes so concurrent edits never overwrite.
export class CloudStore {
  constructor(app) {
    this.db = app.rdb();
    this.bucket = app.storage.from("chiikawa-private");
    this.name = "chiikawa_records";
  }
  check(result) {
    if (result.error) throw result.error;
    return result.data;
  }
  async row(id) {
    return this.check(await this.db.from(this.name).select("body,version").eq("id", id).limit(1))?.[0] ?? null;
  }
  async get(id) { return (await this.row(id))?.body ?? null; }
  async list(kind) {
    const result = [];
    for (let offset = 0;; offset += 100) {
      const rows = this.check(await this.db.from(this.name).select("body").eq("kind", kind).order("id").range(offset, offset + 99));
      result.push(...rows.map(row => row.body));
      if (rows.length < 100) return result;
    }
  }
  async mutate(id, fn) {
    for (let retry = 0; retry < 8; retry++) {
      const current = await this.row(id);
      const next = await fn(current?.body ?? null);
      if (!current && next === null) return null;
      let response;
      if (!current) {
        response = await this.db.from(this.name).insert({id, kind: next.kind, body: next, version: 1}).select("id");
        if (response.error?.code === "23505") continue;
      } else if (next === null) {
        response = await this.db.from(this.name).delete().eq("id", id).eq("version", current.version).select("id");
      } else {
        response = await this.db.from(this.name).update({kind: next.kind, body: next, version: Number(current.version) + 1}).eq("id", id).eq("version", current.version).select("id");
      }
      const rows = this.check(response);
      if (rows?.length) return next;
    }
    throw Object.assign(new Error("同时操作较多，请重试"), {status: 409});
  }
  async putFile(id, bytes) {
    this.check(await this.bucket.upload(id, bytes, {contentType: "application/octet-stream", upsert: false}));
    return id;
  }
  async getFile(id) {
    const blob = this.check(await this.bucket.download(id));
    return Buffer.from(await blob.arrayBuffer());
  }
}
