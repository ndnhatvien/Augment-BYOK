const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createServer } = require("../tools/ace-adapter/server");
const { state } = require("../payload/extension/out/byok/config/state");
const { maybeInjectOfficialCodebaseRetrieval } = require("../payload/extension/out/byok/runtime/official/codebase-retrieval");

async function withOfficialConfig(official, fn) {
  const previous = state.configManager;
  state.configManager = { get: () => ({ official }) };
  try {
    return await fn();
  } finally {
    state.configManager = previous;
  }
}

function startFixtureCce({ results } = {}) {
  return new Promise((resolve) => {
    const requests = [];
    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const bodyText = Buffer.concat(chunks).toString("utf8");
        const body = bodyText ? JSON.parse(bodyText) : {};
        requests.push({ url: req.url, authorization: req.headers.authorization || "", body });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ results }));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, requests, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function startAdapter({ token } = {}) {
  return new Promise((resolve) => {
    const server = createServer({ token });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function postJson(baseUrl, pathname, body, { authorization } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, baseUrl);
    const payload = JSON.stringify(body);
    const headers = { "content-type": "application/json", "content-length": Buffer.byteLength(payload) };
    if (authorization) headers.authorization = authorization;
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: "POST", headers },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (text += c));
        res.on("end", () => resolve({ status: res.statusCode, text }));
      }
    );
    req.on("error", reject);
    req.end(payload);
  });
}

async function withEnv(env, fn) {
  const previous = {};
  for (const key of Object.keys(env)) previous[key] = process.env[key];
  for (const key of Object.keys(env)) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("ace-adapter: codebase-retrieval forwards to CCE /search and returns formatted_retrieval", async () => {
  const cce = await startFixtureCce({
    results: [
      {
        id: "chunk-1",
        file_path: "src/payments.ts",
        start_line: 12,
        end_line: 18,
        content: "export function processPayment(amount) { ... }",
        chunk_type: "function",
        language: "typescript",
        confidence_score: 0.87
      }
    ]
  });
  const adapter = await startAdapter();
  try {
    await withEnv({ ACE_CCE_URL: cce.baseUrl }, async () => {
      const resp = await postJson(adapter.baseUrl, "/agents/codebase-retrieval", {
        information_request: "add logging to payment requests",
        blobs: { checkpoint_id: "cp1", added_blobs: ["src/payments.ts"], deleted_blobs: [] },
        dialog: [],
        max_output_length: 20000,
        disable_codebase_retrieval: false,
        enable_commit_retrieval: false
      });

      assert.equal(resp.status, 200);
      const json = JSON.parse(resp.text);
      assert.ok(json.formatted_retrieval || json.formattedRetrieval, "expected formatted_retrieval field");
      const formatted = String(json.formatted_retrieval || json.formattedRetrieval);
      assert.match(formatted, /src\/payments\.ts/);
      assert.match(formatted, /processPayment/);
      assert.equal(cce.requests.length, 1);
      assert.equal(cce.requests[0].url, "/search");
      assert.equal(cce.requests[0].body.query, "add logging to payment requests");
      assert.equal(cce.requests[0].body.top_k, 10);
    });
  } finally {
    await new Promise((r) => cce.server.close(r));
    await new Promise((r) => adapter.server.close(r));
  }
});

test("ace-adapter: codebase-retrieval rejects empty information_request", async () => {
  const adapter = await startAdapter();
  try {
    const resp = await postJson(adapter.baseUrl, "/agents/codebase-retrieval", {
      information_request: "",
      blobs: { checkpoint_id: "cp1", added_blobs: ["src/a.js"], deleted_blobs: [] },
      dialog: []
    });
    assert.equal(resp.status, 400);
  } finally {
    await new Promise((r) => adapter.server.close(r));
  }
});

test("ace-adapter: context-canvas/list and search-external-sources fail open with empty shapes", async () => {
  const adapter = await startAdapter();
  try {
    const canvas = await postJson(adapter.baseUrl, "/context-canvas/list", { page_size: 100, page_token: "" });
    assert.equal(canvas.status, 200);
    const canvasJson = JSON.parse(canvas.text);
    assert.deepEqual(canvasJson.canvases, []);
    assert.equal(canvasJson.next_page_token, "");

    const sources = await postJson(adapter.baseUrl, "/search-external-sources", { query: "hello", source_types: [] });
    assert.equal(sources.status, 200);
    const sourcesJson = JSON.parse(sources.text);
    assert.deepEqual(sourcesJson.sources, []);
  } finally {
    await new Promise((r) => adapter.server.close(r));
  }
});

test("ace-adapter: get-models returns the minimal official shape for panel Test connection", async () => {
  const adapter = await startAdapter();
  try {
    const resp = await postJson(adapter.baseUrl, "/get-models", {});
    assert.equal(resp.status, 200);
    const json = JSON.parse(resp.text);
    assert.ok("models" in json);
    assert.ok("default_model" in json);
    assert.ok("feature_flags" in json);
    assert.deepEqual(json.models, []);
    assert.equal(json.default_model, "");
  } finally {
    await new Promise((r) => adapter.server.close(r));
  }
});

test("ace-adapter: bearer token enforced when ACE_ADAPTER_TOKEN is set", async () => {
  const adapter = await startAdapter({ token: "secret-token" });
  try {
    const unauthorized = await postJson(adapter.baseUrl, "/search-external-sources", { query: "x", source_types: [] });
    assert.equal(unauthorized.status, 401);

    const authorized = await postJson(adapter.baseUrl, "/search-external-sources", { query: "x", source_types: [] }, { authorization: "Bearer secret-token" });
    assert.equal(authorized.status, 200);
  } finally {
    await new Promise((r) => adapter.server.close(r));
  }
});

test("ace-adapter: unknown path returns 404 and GET /health is open", async () => {
  const adapter = await startAdapter();
  try {
    const health = await new Promise((resolve, reject) => {
      http.get(`${adapter.baseUrl}/health`, (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (text += c));
        res.on("end", () => resolve({ status: res.statusCode, text }));
      }).on("error", reject);
    });
    assert.equal(health.status, 200);
    const missing = await postJson(adapter.baseUrl, "/unknown", {});
    assert.equal(missing.status, 404);
  } finally {
    await new Promise((r) => adapter.server.close(r));
  }
});

test("ace-adapter: end-to-end BYOK client injects CCE retrieval through the adapter", async () => {
  const cce = await startFixtureCce({
    results: [
      {
        id: "chunk-1",
        file_path: "src/payments.ts",
        start_line: 12,
        end_line: 18,
        content: "export function processPayment(amount) { ... }",
        chunk_type: "function",
        language: "typescript",
        confidence_score: 0.87
      }
    ]
  });
  const adapter = await startAdapter();
  try {
    await withEnv({ ACE_CCE_URL: cce.baseUrl }, async () => {
      await withOfficialConfig({ completionUrl: adapter.baseUrl, apiToken: "local-ace-token" }, async () => {
        const req = {
          message: "add logging to payment requests",
          blobs: { checkpoint_id: "cp1", added_blobs: ["src/payments.ts"], deleted_blobs: [] },
          nodes: []
        };

        const injected = await maybeInjectOfficialCodebaseRetrieval({ req, timeoutMs: 4000 });

        assert.equal(injected, true);
        assert.ok(req.nodes.some((n) => typeof n?.text_node?.content === "string" && n.text_node.content.includes("processPayment")));
        assert.equal(cce.requests.length, 1);
        assert.equal(cce.requests[0].url, "/search");
        assert.equal(cce.requests[0].body.query, "add logging to payment requests");
      });
    });
  } finally {
    await new Promise((r) => cce.server.close(r));
    await new Promise((r) => adapter.server.close(r));
  }
});

