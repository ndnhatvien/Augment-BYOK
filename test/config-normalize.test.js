const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeConfig } = require("../payload/extension/out/byok/config/config");

test("normalizeConfig: strips prototype-pollution keys recursively", () => {
  const raw = JSON.parse(`{
    "providers": [
      {
        "id": "p1",
        "type": "openai_compatible",
        "headers": {
          "__proto__": { "polluted": "yes" },
          "authorization": "Bearer sk-proj-1234567890abcdef1234567890abcdef",
          "content-type": "application/json"
        },
        "requestDefaults": {
          "timeoutMs": 12345,
          "constructor": { "prototype": { "polluted2": "yes" } }
        }
      }
    ],
    "historySummary": {
      "contextWindowTokensOverrides": {
        "__proto__": { "polluted3": "yes" },
        "gpt-4o": 128000
      }
    }
  }`);

  const cfg = normalizeConfig(raw);
  assert.ok(cfg && typeof cfg === "object");
  assert.equal(cfg.providers.length, 1);

  const headers = cfg.providers[0].headers;
  assert.equal(headers.authorization, "Bearer sk-proj-1234567890abcdef1234567890abcdef");
  assert.equal(headers["content-type"], "application/json");
  assert.equal(Object.prototype.hasOwnProperty.call(headers, "__proto__"), false);
  assert.equal(headers.polluted, undefined);

  const requestDefaults = cfg.providers[0].requestDefaults;
  assert.equal(requestDefaults.timeoutMs, 12345);
  assert.equal(Object.prototype.hasOwnProperty.call(requestDefaults, "constructor"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(requestDefaults, "prototype"), false);

  const overrides = cfg.historySummary.contextWindowTokensOverrides;
  assert.equal(overrides["gpt-5.3-codex"], 400000);
  assert.equal(overrides["gpt-4o"], 128000);
  assert.equal(Object.prototype.hasOwnProperty.call(overrides, "__proto__"), false);
  assert.equal(overrides.polluted3, undefined);
});

test("normalizeConfig: routing.rules merges with defaults (and clears provider/model when not byok)", () => {
  const cfg = normalizeConfig({
    routing: {
      rules: {
        "/chat": { mode: "official", providerId: "p1", model: "m1" },
        "/unknown-endpoint": { mode: "official" }
      }
    }
  });

  assert.equal(cfg.routing.rules["/chat"].mode, "official");
  assert.equal(cfg.routing.rules["/chat"].providerId, "");
  assert.equal(cfg.routing.rules["/chat"].model, "");

  assert.equal(cfg.routing.rules["/chat-stream"].mode, "byok");
  assert.equal(cfg.routing.rules["/unknown-endpoint"], undefined);

  const cfg2 = normalizeConfig({ routing: { rules: {} } });
  assert.equal(cfg2.routing.rules["/chat"].mode, "byok");
});

test("normalizeConfig: provider.models ignores non-string entries", () => {
  const cfg = normalizeConfig({
    providers: [
      {
        id: "p1",
        type: "openai_compatible",
        baseUrl: "https://example.invalid/v1",
        models: ["a", 1, null, {}, "b", " a "],
        defaultModel: "a"
      }
    ]
  });

  assert.deepEqual(cfg.providers[0].models, ["a", "b"]);
});

test("normalizeConfig: preserves provider underlying model mapping", () => {
  const cfg = normalizeConfig({
    providers: [
      {
        id: "p1",
        type: "openai_compatible",
        baseUrl: "https://example.invalid/v1",
        models: ["a"],
        defaultModel: "a",
        underlying_model_mapping: {
          title_generation: "m-title",
          summary: "m-summary"
        }
      }
    ]
  });

  assert.deepEqual(cfg.providers[0].underlyingModelMapping, {
    titleGeneration: "m-title",
    summary: "m-summary"
  });
});

test("normalizeConfig: drops legacy officialDelegation block", () => {
  const cfg = normalizeConfig({
    officialDelegation: {
      enabled: true,
      strictByokExecution: true,
      executionOwner: "official",
      intrusionMode: "strong",
      failPolicy: "fallback_official",
      timeoutMs: 5000,
      endpoints: {
        chat: true,
        "/chat-stream?x=1": false,
        "/completion": true,
        "/invalid": "x"
      }
    }
  });

  assert.equal(Object.prototype.hasOwnProperty.call(cfg, "officialDelegation"), false);
});

test("normalizeConfig: official.localAceEnabled and official.aceCceUrl normalize (camelCase + snake_case)", () => {
  const cfg = normalizeConfig({
    official: {
      localAceEnabled: true,
      aceCceUrl: "http://127.0.0.1:8765"
    }
  });
  assert.equal(cfg.official.localAceEnabled, true);
  assert.equal(cfg.official.aceCceUrl, "http://127.0.0.1:8765");

  const snake = normalizeConfig({
    official: {
      local_ace_enabled: true,
      aceCceUrl: "  http://127.0.0.1:9000  "
    }
  });
  assert.equal(snake.official.localAceEnabled, true);
  assert.equal(snake.official.aceCceUrl, "http://127.0.0.1:9000");

  const off = normalizeConfig({ official: { localAceEnabled: false, aceCceUrl: "" } });
  assert.equal(off.official.localAceEnabled, false);
  assert.equal(off.official.aceCceUrl, "");
});

test("normalizeConfig: mcp block normalizes enabled/injectPosition/servers and drops invalid entries", () => {
  const cfg = normalizeConfig({
    mcp: {
      enabled: true,
      injectPosition: "replace",
      servers: [
        { name: "files", command: "node", args: ["/path/srv.js", "x"], env: { A: "1" } },
        { name: "", command: "bad", args: [] },
        { name: "nocmd", command: "  ", args: [] },
        null
      ]
    }
  });
  assert.equal(cfg.mcp.enabled, true);
  assert.equal(cfg.mcp.injectPosition, "replace");
  assert.equal(cfg.mcp.servers.length, 1);
  const s = cfg.mcp.servers[0];
  assert.equal(s.name, "files");
  assert.equal(s.command, "node");
  assert.deepEqual(s.args, ["/path/srv.js", "x"]);
  assert.equal(Object.getPrototypeOf(s.env), null);
  assert.equal(s.env.A, "1");

  const defaults = normalizeConfig({});
  assert.equal(defaults.mcp.enabled, false);
  assert.equal(defaults.mcp.injectPosition, "before");
  assert.deepEqual(defaults.mcp.servers, []);

  const badPos = normalizeConfig({ mcp: { enabled: true, injectPosition: "sideways", servers: [] } });
  assert.equal(badPos.mcp.injectPosition, "before");
});

