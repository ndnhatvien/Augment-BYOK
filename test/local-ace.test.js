const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { state } = require("../payload/extension/out/byok/config/state");
const { resolveLocalAceConnection, fetchLocalCodebaseRetrieval, buildCceSearchPayload, computeCceProjectSlug, resolveLocalAceWorkspaceIndexMatch } = require("../payload/extension/out/byok/runtime/ace/local-ace");
const { maybeInjectOfficialCodebaseRetrieval } = require("../payload/extension/out/byok/runtime/official/codebase-retrieval");
const { maybeHandleCallApi } = require("../payload/extension/out/byok/runtime/shim/call-api");

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
        requests.push({ url: req.url, body });
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

function startDownCce() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      req.resume();
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "boom" }));
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

const SAMPLE_RESULTS = [
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
];

test("local-ace: resolveLocalAceConnection returns null when disabled and url when enabled", async () => {
  await withOfficialConfig({ localAceEnabled: false }, async () => {
    assert.equal(resolveLocalAceConnection(), null);
  });
  await withOfficialConfig({ localAceEnabled: true, aceCceUrl: "" }, async () => {
    const conn = resolveLocalAceConnection();
    assert.ok(conn);
    assert.equal(conn.cceUrl, "http://127.0.0.1:8765");
  });
  await withOfficialConfig({ localAceEnabled: true, aceCceUrl: "http://127.0.0.1:9000" }, async () => {
    const conn = resolveLocalAceConnection();
    assert.ok(conn);
    assert.equal(conn.cceUrl, "http://127.0.0.1:9000");
  });
});

test("local-ace: buildCceSearchPayload bounds top_k and confidence_threshold", () => {
  const p = buildCceSearchPayload({ query: "  q  " });
  assert.equal(p.query, "q");
  assert.equal(p.top_k, 10);
  assert.equal(p.confidence_threshold, 0.2);

  const clamped = buildCceSearchPayload({ query: "x", topK: 500, confidenceThreshold: 2 });
  assert.equal(clamped.top_k, 100);
  assert.equal(clamped.confidence_threshold, 1);
});

test("local-ace: fetchLocalCodebaseRetrieval searches CCE and formats retrieval", async () => {
  const cce = await startFixtureCce({ results: SAMPLE_RESULTS });
  try {
    const formatted = await fetchLocalCodebaseRetrieval({
      cceUrl: cce.baseUrl,
      informationRequest: "add logging to payment requests",
      blobs: { checkpoint_id: "cp1", added_blobs: ["src/payments.ts"] },
      maxOutputLength: 20000,
      timeoutMs: 4000
    });
    assert.match(formatted, /src\/payments\.ts/);
    assert.match(formatted, /processPayment/);
    assert.match(formatted, /CODEBASE_RETRIEVAL\] request:/);
    assert.match(formatted, /CODEBASE_RETRIEVAL\] blobs:/);
    assert.equal(cce.requests.length, 1);
    assert.equal(cce.requests[0].url, "/search");
    assert.equal(cce.requests[0].body.query, "add logging to payment requests");
    assert.equal(cce.requests[0].body.top_k, 10);
  } finally {
    await new Promise((r) => cce.server.close(r));
  }
});

test("local-ace: maybeInjectOfficialCodebaseRetrieval uses local CCE without token and without blobs", async () => {
  const cce = await startFixtureCce({ results: SAMPLE_RESULTS });
  try {
    await withOfficialConfig({ localAceEnabled: true, aceCceUrl: cce.baseUrl, apiToken: "" }, async () => {
      const req = { message: "add logging to payment requests", nodes: [] };
      const injected = await maybeInjectOfficialCodebaseRetrieval({ req, timeoutMs: 4000 });
      assert.equal(injected, true);
      assert.ok(req.nodes.some((n) => typeof n?.text_node?.content === "string" && n.text_node.content.includes("processPayment")));
      assert.equal(cce.requests.length, 1);
      assert.equal(cce.requests[0].url, "/search");
    });
  } finally {
    await new Promise((r) => cce.server.close(r));
  }
});

test("local-ace: maybeInjectOfficialCodebaseRetrieval fails open when CCE is down", async () => {
  const down = await startDownCce();
  try {
    await withOfficialConfig({ localAceEnabled: true, aceCceUrl: down.baseUrl, apiToken: "" }, async () => {
      const req = { message: "what is the router?", nodes: [] };
      const injected = await maybeInjectOfficialCodebaseRetrieval({ req, timeoutMs: 4000 });
      assert.equal(injected, false);
      assert.deepEqual(req.nodes, []);
    });
  } finally {
    await new Promise((r) => down.server.close(r));
  }
});

test("local-ace: localAceEnabled=false falls back to official path (no token -> skipped)", async () => {
  await withOfficialConfig({ localAceEnabled: false, apiToken: "" }, async () => {
    const req = { message: "hello", nodes: [] };
    const injected = await maybeInjectOfficialCodebaseRetrieval({ req, timeoutMs: 1000 });
    assert.equal(injected, false);
    assert.deepEqual(req.nodes, []);
  });
});

test("local-ace: computeCceProjectSlug matches CCE basename-<6hex> scheme", () => {
  const slug = computeCceProjectSlug("/home/nhatvien/Projects/MCP/Augment-BYOK");
  assert.match(slug, /^Augment-BYOK-[0-9a-f]{6}$/);
  assert.equal(slug, "Augment-BYOK-9bb566");
  const grok = computeCceProjectSlug("/home/nhatvien/Projects/MCP/grok-register-panel");
  assert.equal(grok, "grok-register-panel-899dd3");
  const weird = computeCceProjectSlug("/tmp/opencode/Project With Spaces");
  assert.equal(weird, "Project-With-Spaces-56f749");
});

test("local-ace: resolveLocalAceWorkspaceIndexMatch returns true when workspace index exists and matches", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cce-ws-match-"));
  try {
    const slug = computeCceProjectSlug("/tmp/fake-augment-byok");
    const indexDir = path.join(tmp, slug);
    fs.mkdirSync(indexDir, { recursive: true });
    fs.writeFileSync(path.join(indexDir, "meta.json"), JSON.stringify({ project_dir: "/tmp/fake-augment-byok" }));
    const match = resolveLocalAceWorkspaceIndexMatch({
      workspaceFolders: ["/tmp/fake-augment-byok"],
      storageRoot: tmp
    });
    assert.equal(match, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("local-ace: resolveLocalAceWorkspaceIndexMatch returns false when workspace index missing", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cce-ws-miss-"));
  try {
    const match = resolveLocalAceWorkspaceIndexMatch({
      workspaceFolders: ["/tmp/fake-unknown-project"],
      storageRoot: tmp
    });
    assert.equal(match, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("local-ace: resolveLocalAceWorkspaceIndexMatch returns null when no workspace resolvable", () => {
  const match = resolveLocalAceWorkspaceIndexMatch({ workspaceFolders: [] });
  assert.equal(match, null);
});

test("local-ace: maybeInjectOfficialCodebaseRetrieval skips local CCE when workspace has no matching index", async () => {
  const cce = await startFixtureCce({ results: SAMPLE_RESULTS });
  try {
    await withOfficialConfig({ localAceEnabled: true, aceCceUrl: cce.baseUrl, apiToken: "" }, async () => {
      const req = { message: "add logging to payment requests", nodes: [] };
      const injected = await maybeInjectOfficialCodebaseRetrieval({
        req,
        timeoutMs: 4000,
        localAceWorkspaceFolders: ["/tmp/fake-unknown-project"]
      });
      assert.equal(injected, false);
      assert.deepEqual(req.nodes, []);
      assert.equal(cce.requests.length, 0);
    });
  } finally {
    await new Promise((r) => cce.server.close(r));
  }
});

test("local-ace: callApi /agents/codebase-retrieval serves local CCE result while routing stays disabled", async () => {
  const cce = await startFixtureCce({ results: SAMPLE_RESULTS });
  try {
    await withOfficialConfig({ localAceEnabled: true, aceCceUrl: cce.baseUrl, apiToken: "" }, async () => {
      const out = await maybeHandleCallApi({
        endpoint: "agents/codebase-retrieval",
        body: {
          information_request: "add logging to payment requests",
          blobs: { checkpoint_id: "cp1", added_blobs: ["src/payments.ts"], deleted_blobs: [] },
          dialog: [],
          max_output_length: 20000
        },
        transform: (raw) => raw,
        timeoutMs: 4000
      });
      assert.ok(out && typeof out === "object", "expected callApi response object");
      assert.match(String(out.formatted_retrieval || out.formattedRetrieval || ""), /src\/payments\.ts/);
      assert.match(String(out.formatted_retrieval || out.formattedRetrieval || ""), /processPayment/);
      assert.equal(cce.requests.length, 1);
      assert.equal(cce.requests[0].url, "/search");
      assert.equal(cce.requests[0].body.query, "add logging to payment requests");
    });
  } finally {
    await new Promise((r) => cce.server.close(r));
  }
});

test("local-ace: callApi /agents/codebase-retrieval falls back to disabled empty when local ACE is off", async () => {
  await withOfficialConfig({ localAceEnabled: false, apiToken: "" }, async () => {
    const out = await maybeHandleCallApi({
      endpoint: "agents/codebase-retrieval",
      body: { information_request: "find payments", blobs: {}, dialog: [], max_output_length: 20000 },
      transform: (raw) => raw,
      timeoutMs: 4000
    });
    assert.ok(out && typeof out === "object");
    assert.deepEqual(out, { tools: [], agents: [], items: [], data: [], results: [] });
  });
});

test("local-ace: callApi /agents/codebase-retrieval falls back to disabled empty when CCE is down", async () => {
  const down = await startDownCce();
  try {
    await withOfficialConfig({ localAceEnabled: true, aceCceUrl: down.baseUrl, apiToken: "" }, async () => {
      const out = await maybeHandleCallApi({
        endpoint: "agents/codebase-retrieval",
        body: { information_request: "find payments", blobs: {}, dialog: [], max_output_length: 20000 },
        transform: (raw) => raw,
        timeoutMs: 4000
      });
      assert.ok(out && typeof out === "object");
      assert.deepEqual(out, { tools: [], agents: [], items: [], data: [], results: [] });
    });
  } finally {
    await new Promise((r) => down.server.close(r));
  }
});
