const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { state } = require("../payload/extension/out/byok/config/state");
const { McpClient } = require("../payload/extension/out/byok/mcp/client");
const { maybeInjectMcpContext, setMcpClient, getMcpClient } = require("../payload/extension/out/byok/runtime/official/mcp-retrieval");

async function withMcpClient(client, fn) {
  const previous = getMcpClient();
  setMcpClient(client || null);
  try {
    return await fn();
  } finally {
    setMcpClient(previous);
  }
}

function buildReq() {
  return {
    message: "where is payment validation?",
    path: "/tmp/ws",
    lang: "ts",
    nodes: [{ id: -20, type: "RETRIEVAL", text: "official" }]
  };
}

test("mcp-context: skipped when mcp not enabled", async () => {
  const injected = await maybeInjectMcpContext({ req: buildReq(), mcpConfig: { enabled: false, injectPosition: "before", servers: [] } });
  assert.equal(injected, false);
});

test("mcp-context: skipped when client not initialized", async () => {
  const injected = await withMcpClient(null, () => maybeInjectMcpContext({ req: buildReq(), mcpConfig: { enabled: true, injectPosition: "before", servers: [] } }));
  assert.equal(injected, false);
});

test("mcp-context: skipped when message empty or disable_retrieval", async () => {
  await withMcpClient({ getContext: async () => ({ text: "ctx", sources: [] }) }, async () => {
    const noMsg = await maybeInjectMcpContext({ req: { ...buildReq(), message: "" }, mcpConfig: { enabled: true, injectPosition: "before", servers: [] } });
    assert.equal(noMsg, false);

    const disabled = await maybeInjectMcpContext({ req: { ...buildReq(), disable_retrieval: true }, mcpConfig: { enabled: true, injectPosition: "before", servers: [] } });
    assert.equal(disabled, false);
  });
});

test("mcp-context: injects before official retrieval node (default position)", async () => {
  await withMcpClient({
    getContext: async ({ query }) => ({ text: "payments.ts: processPayment", sources: [{ server: "files", source: "prompt" }] })
  }, async () => {
    const req = buildReq();
    const injected = await maybeInjectMcpContext({ req, timeoutMs: 4000, mcpConfig: { enabled: true, injectPosition: "before", servers: [] } });
    assert.equal(injected, true);
    assert.equal(req.nodes.length, 2);
    assert.ok(req.nodes[0].text_node && typeof req.nodes[0].text_node.content === "string", "expected text node");
    assert.match(req.nodes[0].text_node.content, /MCP_CONTEXT/);
    assert.match(req.nodes[0].text_node.content, /payments\.ts: processPayment/);
    assert.equal(req.nodes[1].id, -20);
  });
});

test("mcp-context: replace position drops official retrieval nodes and appends mcp node", async () => {
  await withMcpClient({
    getContext: async () => ({ text: "mcp-only", sources: [{ server: "s1", source: "prompt", promptName: "q" }] })
  }, async () => {
    const req = {
      ...buildReq(),
      nodes: [
        { id: -20, type: "RETRIEVAL", text: "official-retrieval" },
        { id: -21, type: "EXTERNAL", text: "official-external" },
        { id: 5, type: "TOOL_RESULT", text: "tool" }
      ]
    };
    const injected = await maybeInjectMcpContext({ req, timeoutMs: 4000, mcpConfig: { enabled: true, injectPosition: "replace", servers: [] } });
    assert.equal(injected, true);
    const ids = req.nodes.map((n) => n.id);
    assert.equal(ids.includes(-20), false);
    assert.equal(ids.includes(-21), false);
    assert.equal(ids.includes(5), true);
    assert.match(req.nodes[req.nodes.length - 1].text_node.content, /MCP_CONTEXT/);
  });
});

test("mcp-context: end-to-end with real MCP stdio server process", async () => {
  const serverCode = `"use strict";
const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const msg = JSON.parse(line);
  const reply = (obj) => process.stdout.write(JSON.stringify(obj) + "\\n");
  if (msg.method === "initialize") {
    reply({ jsonrpc: "2.0", id: msg.id, result: { capabilities: { prompts: {}, resources: {}, tools: {} }, protocolVersion: "2024-11-05", serverInfo: { name: "fixture", version: "1.0.0" } } });
  } else if (msg.method === "notifications/initialized") {
    // no reply
  } else if (msg.method === "prompts/list") {
    reply({ jsonrpc: "2.0", id: msg.id, result: { prompts: [{ name: "codebase", description: "search" }] } });
  } else if (msg.method === "prompts/get") {
    reply({ jsonrpc: "2.0", id: msg.id, result: { messages: [{ role: "user", content: { type: "text", text: "FOUND " + (msg.params.arguments && msg.params.arguments.query || "") } }] } });
  } else if (msg.method === "tools/list") {
    reply({ jsonrpc: "2.0", id: msg.id, result: { tools: [] } });
  } else {
    reply({ jsonrpc: "2.0", id: msg.id, result: {} });
  }
});
`;
  const fixturePath = path.join(os.tmpdir(), `mcp-fixture-${Date.now()}.js`);
  fs.writeFileSync(fixturePath, serverCode);

  const client = new McpClient([{ name: "fixture", command: process.execPath, args: [fixturePath], env: {} }]);
  try {
    await client.init();
    assert.equal(client.initialized, true);

    const context = await client.getContext({ query: "find token", workspacePath: "/tmp/ws", language: "ts", timeout: 4000 });
    assert.match(context.text, /FOUND find token/);
    assert.ok(context.sources.length > 0);

    const req = buildReq();
    req.message = "find token";
    const injected = await withMcpClient(client, () => maybeInjectMcpContext({ req, timeoutMs: 8000, mcpConfig: { enabled: true, injectPosition: "before", servers: [] } }));
    assert.equal(injected, true);
    assert.match(req.nodes[0].text_node.content, /FOUND find token/);
  } finally {
    await client.dispose();
    try { fs.unlinkSync(fixturePath); } catch {}
  }
});

test("mcp-context: client init fails open when all servers fail", async () => {
  const client = new McpClient([{ name: "bad", command: "definitely-not-a-real-command-xyz", args: [], env: {} }]);
  let threw = false;
  try {
    await client.init();
  } catch (err) {
    threw = true;
  }
  assert.equal(threw, true);
});
