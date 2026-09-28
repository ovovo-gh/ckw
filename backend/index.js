// CloudBase event function; all client database/storage access stays denied.
exports.main = async (event) => {
  const [{ default: tcb }, { createService }, { CloudStore }, fs] =
    await Promise.all([
      Promise.resolve({ default: require("@cloudbase/js-sdk") }),
      import("./core.mjs"),
      import("./store.mjs"),
      import("node:fs/promises"),
    ]);
  if (!globalThis.chiikawaService) {
    const accounts = JSON.parse(
      Buffer.from(process.env.SPACE_ACCOUNTS_B64 || "W10=", "base64").toString(
        "utf8",
      ),
    );
    const seed = JSON.parse(
      await fs.readFile(__dirname + "/seed.json", "utf8"),
    );
    const app = tcb.init({
      env: process.env.SPACE_ENV_ID,
      region: "ap-shanghai",
      accessKey: process.env.CLOUDBASE_APIKEY,
      timeout: 45000,
    });
    globalThis.chiikawaService = createService({
      store: new CloudStore(app),
      accounts,
      seed,
    });
  }
  if (!event.httpMethod) return globalThis.chiikawaService(event);
  const respond = (statusCode, body) => ({
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin":
        "https://gh-d0g7evem069de6a44-1497395816.tcloudbaseapp.com",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    },
    body: JSON.stringify(body),
    isBase64Encoded: false,
  });
  if (event.httpMethod === "OPTIONS") return respond(204, null);
  if (event.httpMethod !== "POST")
    return respond(405, { ok: false, status: 405, error: "请使用 POST 请求" });
  let input;
  try {
    const body = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
    if (typeof body !== "string" || Buffer.byteLength(body) > 4.2 * 1024 * 1024)
      throw Error();
    input = JSON.parse(body);
  } catch {
    return respond(400, {
      ok: false,
      status: 400,
      error: "请求格式错误或内容过大",
    });
  }
  const result = await globalThis.chiikawaService(input);
  return respond(result.ok ? 200 : result.status || 500, result);
};
