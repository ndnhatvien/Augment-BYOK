const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { patchWebviewTokenUsage, buildTokenUsageInjection } = require("../tools/patch/patch-webview-token-usage");
const { TOKEN_USAGE_PATCH_MARKER } = require("../tools/patch/webview-assets");

function withTempDir(prefix, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeUtf8(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

// 模拟上游混淆产物：包含 assistant 消息气泡组件特征（c-aug-msg__footer + $exchange + structured_output_nodes）
// 以及 nS 组件的挂载收尾锚点。
function makeFixtureSrc() {
  return [
    `var tS=C('<div class="c-aug-msg__footer hidden-when-empty svelte-18qub4q"><!> <!></div>'),sS=C("<!> <!>",1);`,
    `function nS(o,e){ve(e,!0);const s=()=>te(t(i),"$exchange",r),[r,a]=De();var m=sS(),p=D(m),_=$=>{};`,
    `var y=A=>{};O(p,$=>{te(t(v),"$showFooter",r)&&$(_)});var b=T(p,2),I=$=>{};`,
    `O(b,$=>{s()&&s().status===es.failed&&$(I)}),n(o,m),he(),a()}`
  ].join("\n");
}

test("patchWebviewTokenUsage: injects token usage display into assistant message component", () => {
  withTempDir("augment-byok-webview-tu-", (dir) => {
    const extDir = path.join(dir, "extension");
    const assetsDir = path.join(extDir, "common-webviews", "assets");
    const filePath = path.join(assetsDir, "main-panel-test.js");

    writeUtf8(filePath, makeFixtureSrc() + "\n");

    const result = patchWebviewTokenUsage(extDir);
    assert.equal(result.changed, true);
    assert.equal(result.results.length, 1);

    const out = readUtf8(filePath);
    assert.ok(out.includes(TOKEN_USAGE_PATCH_MARKER), "marker missing");
    assert.ok(out.includes("data-byok-token-usage"), "DOM injection missing");
    assert.ok(out.includes('nd&&nd.type===10&&nd.token_usage'), "TOKEN_USAGE node detection missing");
    assert.ok(out.includes("fmtK"), "k formatter missing");
    assert.ok(out.includes("pct"), "percentage helper missing");
    assert.ok(out.includes('"缓存读 "+cr+"%"'), "cache read percentage display missing");
    assert.ok(out.includes('"缓存写 "+cw+"%"'), "cache creation percentage display missing");
  });
});

test("patchWebviewTokenUsage: refuses ambiguous anchor", () => {
  withTempDir("augment-byok-webview-tu-", (dir) => {
    const extDir = path.join(dir, "extension");
    const assetsDir = path.join(extDir, "common-webviews", "assets");
    const filePath = path.join(assetsDir, "main-panel-test.js");

    // 锚点出现两次 → 拒绝 patch，避免误伤
    writeUtf8(
      filePath,
      makeFixtureSrc() + "\n" + "s()&&s().status===es.failed&&$(I)}),n(o,m),he(),a()\n"
    );

    assert.throws(() => patchWebviewTokenUsage(extDir), /matched multiple times/);
  });
});

test("patchWebviewTokenUsage: validates already-marked assets", () => {
  withTempDir("augment-byok-webview-tu-", (dir) => {
    const extDir = path.join(dir, "extension");
    const assetsDir = path.join(extDir, "common-webviews", "assets");
    const filePath = path.join(assetsDir, "main-panel-test.js");

    // 模拟真实已 patch 状态：注入已存在 + marker（直接复用导出函数，避免字符串漂移）
    const alreadyPatched = makeFixtureSrc().replace("he(),a()}", `,${buildTokenUsageInjection()},he(),a()}`);
    writeUtf8(filePath, alreadyPatched + "\n;/*" + TOKEN_USAGE_PATCH_MARKER + "*/\n");

    const result = patchWebviewTokenUsage(extDir);
    assert.equal(result.changed, false);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].reason, "already_patched");
  });
});

test("patchWebviewTokenUsage: injected IIFE is syntactically valid", () => {
  withTempDir("augment-byok-webview-tu-", (dir) => {
    const extDir = path.join(dir, "extension");
    const assetsDir = path.join(extDir, "common-webviews", "assets");
    const filePath = path.join(assetsDir, "main-panel-test.js");

    writeUtf8(filePath, makeFixtureSrc() + "\n");
    patchWebviewTokenUsage(extDir);

    // 用 node --check 验证注入后文件语法
    const { execFileSync } = require("node:child_process");
    execFileSync(process.execPath, ["--check", filePath]);
  });
});
