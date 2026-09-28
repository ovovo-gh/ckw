import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createService, makeAccount } from "../backend/core.mjs";
import { LocalStore } from "../backend/store.mjs";
const accounts = await Promise.all([
  makeAccount("one", "test-only-123", "一"),
  makeAccount("two", "test-only-456", "二"),
]);
const seed = {
  series: [{ id: "baby", name: "宝宝" }],
  variants: [{ id: "usagi", name: "兔兔", seriesId: "baby", images: [] }],
  wallpapers: [],
};
async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "chiikawa-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new LocalStore(dir);
  const handle = createService({ store, accounts, seed });
  const login = await handle({
    action: "login",
    username: "one",
    password: "test-only-123",
  });
  assert.equal(login.ok, true);
  return { store, handle, token: login.data.token };
}
const pixel =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6hsAAAAASUVORK5CYII=";
async function photo(handle, token) {
  const r = await handle({
    action: "upload",
    token,
    mime: "image/png",
    base64: pixel,
  });
  assert.equal(r.ok, true);
  return r.data.id;
}
test("two accounts share records; guest projection never contains money, notes or private records", async (t) => {
  const { handle, token } = await fixture(t);
  const pic = await photo(handle, token);
  const one = await handle({
    action: "save",
    token,
    kind: "collection",
    data: {
      name: "公开兔兔",
      price: 328,
      notes: "私人暗号",
      images: [pic],
      variantId: "usagi",
    },
  });
  assert.equal(one.ok, true);
  const hidden = await handle({
    action: "save",
    token,
    kind: "collection",
    data: { name: "秘密礼物", private: true, price: 999 },
  });
  assert.equal(hidden.ok, true);
  const guest = (await handle({ action: "snapshot" })).data;
  assert.equal(guest.collections.length, 1);
  assert.ok(!("price" in guest.collections[0]));
  assert.ok(!("notes" in guest.collections[0]));
  assert.ok(!JSON.stringify(guest).includes("私人暗号"));
  assert.ok(!JSON.stringify(guest).includes("秘密礼物"));
  const two = await handle({
    action: "login",
    username: "two",
    password: "test-only-456",
  });
  const shared = (await handle({ action: "snapshot", token: two.data.token }))
    .data;
  assert.equal(shared.collections.length, 2);
  assert.equal(shared.collections[0].price, 328);
  assert.equal(shared.collections[0].notes, "私人暗号");
  assert.equal((await handle({ action: "export" })).status, 401);
  assert.equal(
    (
      await handle({
        action: "save",
        kind: "collection",
        data: { name: "攻击" },
      })
    ).status,
    401,
  );
});
test("private, removed and deleted photos cannot be retrieved by a visitor", async (t) => {
  const { handle, token } = await fixture(t);
  const pic = await photo(handle, token);
  assert.equal((await handle({ action: "media", id: pic })).status, 404);
  let r = (
    await handle({
      action: "save",
      token,
      kind: "collection",
      data: { name: "兔兔", images: [pic] },
    })
  ).data;
  assert.equal((await handle({ action: "media", id: pic })).ok, true);
  r = (
    await handle({
      action: "save",
      token,
      kind: "collection",
      id: r.id,
      rev: r.rev,
      data: { ...r, private: true },
    })
  ).data;
  assert.equal((await handle({ action: "media", id: pic })).status, 404);
  assert.equal((await handle({ action: "media", id: pic, token })).ok, true);
  r = (
    await handle({
      action: "save",
      token,
      kind: "collection",
      id: r.id,
      rev: r.rev,
      data: { ...r, private: false, images: [] },
    })
  ).data;
  assert.equal((await handle({ action: "media", id: pic })).status, 404);
  await handle({
    action: "delete",
    token,
    kind: "collection",
    id: r.id,
    rev: r.rev,
  });
  assert.equal(
    (await handle({ action: "snapshot", token })).data.collections.length,
    0,
  );
  assert.equal((await handle({ action: "media", id: pic, token })).status, 404);
});
test("concurrent writes detect version conflicts instead of silently overwriting", async (t) => {
  const { handle, token } = await fixture(t);
  const first = (
    await handle({
      action: "save",
      token,
      kind: "collection",
      data: { name: "first" },
    })
  ).data;
  const outputs = await Promise.all(
    ["A", "B"].map((name) =>
      handle({
        action: "save",
        token,
        kind: "collection",
        id: first.id,
        rev: first.rev,
        data: { name },
      }),
    ),
  );
  assert.equal(outputs.filter((r) => r.ok).length, 1);
  assert.equal(outputs.filter((r) => r.status === 409).length, 1);
  assert.equal(
    (
      await handle({
        action: "delete",
        token,
        kind: "collection",
        id: first.id,
        rev: first.rev,
      })
    ).status,
    409,
  );
});
test("wish list is private, logout revokes token, failed logins are rate limited", async (t) => {
  const { handle, token } = await fixture(t);
  await handle({ action: "wish", token, variantId: "usagi", wanted: true });
  assert.equal((await handle({ action: "snapshot" })).data.wishes.length, 0);
  assert.equal(
    (await handle({ action: "snapshot", token })).data.wishes.length,
    1,
  );
  await handle({ action: "logout", token });
  assert.equal((await handle({ action: "export", token })).status, 401);
  for (let i = 0; i < 8; i++)
    assert.equal(
      (await handle({ action: "login", username: "one", password: "bad" }))
        .status,
      401,
    );
  assert.equal(
    (
      await handle({
        action: "login",
        username: "one",
        password: "test-only-123",
      })
    ).status,
    429,
  );
});
test("validation rejects invalid price, date, unsafe URL, fake image and missing references", async (t) => {
  const { handle, token } = await fixture(t);
  for (const data of [
    { name: "x", price: -1 },
    { name: "x", price: "oops" },
    { name: "x", purchaseDate: "2026-02-31" },
    { name: "x", variantId: "missing" },
    { name: "x", images: ["../../etc/passwd"] },
    { name: "" },
  ])
    assert.equal(
      (await handle({ action: "save", token, kind: "collection", data })).ok,
      false,
    );
  assert.equal(
    (
      await handle({
        action: "save",
        token,
        kind: "series",
        data: { name: "bad", sourceUrl: "javascript:alert(1)" },
      })
    ).ok,
    false,
  );
  assert.equal(
    (
      await handle({
        action: "upload",
        token,
        mime: "image/png",
        base64: Buffer.from("<svg/>").toString("base64"),
      })
    ).ok,
    false,
  );
});
test("seed deletion survives restart and referenced variants cannot be deleted", async (t) => {
  const { handle, store, token } = await fixture(t);
  await handle({
    action: "save",
    token,
    kind: "collection",
    data: { name: "x", variantId: "usagi" },
  });
  assert.equal(
    (
      await handle({
        action: "delete",
        token,
        kind: "variant",
        id: "usagi",
        rev: 1,
      })
    ).status,
    409,
  );
  const collection = (await handle({ action: "snapshot", token })).data
    .collections[0];
  await handle({
    action: "delete",
    token,
    kind: "collection",
    id: collection.id,
    rev: 1,
  });
  assert.equal(
    (
      await handle({
        action: "delete",
        token,
        kind: "variant",
        id: "usagi",
        rev: 1,
      })
    ).ok,
    true,
  );
  const restarted = createService({ store, accounts, seed });
  assert.equal(
    (await restarted({ action: "snapshot" })).data.variants.length,
    0,
  );
});
test("each purchase remains a separate record and data persists across service restart", async (t) => {
  const { handle, store, token } = await fixture(t);
  for (const price of [100, 120])
    assert.equal(
      (
        await handle({
          action: "save",
          token,
          kind: "collection",
          data: {
            name: "相同款式",
            price,
            variantId: "usagi",
            status: "arrived",
          },
        })
      ).ok,
      true,
    );
  const restarted = createService({ store, accounts, seed });
  const data = (await restarted({ action: "export", token })).data;
  assert.equal(data.collections.length, 2);
  assert.notEqual(data.collections[0].id, data.collections[1].id);
  assert.deepEqual(
    data.collections.map((x) => x.price),
    [100, 120],
  );
});
