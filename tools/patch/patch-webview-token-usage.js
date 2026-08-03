"use strict";

const path = require("path");

const { replaceOnceRegex } = require("../lib/patch");
const { loadPatchText, savePatchText } = require("./patch-target");
const { TOKEN_USAGE_PATCH_MARKER, listWebviewTokenUsageAssets } = require("./webview-assets");

const PATCH_LABEL = "webview token usage display";

// 注入的 IIFE 依赖组件作用域里的 o（挂载点）与 s()（exchange getter）。
// 通过轮询读取 exchange.structured_output_nodes 里的 TOKEN_USAGE 节点（type=10），
// 把 token_usage 渲染成挂载点下方一行小字；组件卸载（o.isConnected=false）时自动清理。
function buildTokenUsageInjection() {
  return String.raw`(function(){var last="";function fmtK(n){if(n==null)return null;var v=n/1000;var r=Math.round(v*10)/10;return String(r)+"k"}function pct(part,total){if(part==null||total==null||total<=0)return null;return Math.round((part/total)*1000)/10}var timer=setInterval(function(){if(!o||!o.isConnected){clearInterval(timer);return}var ex=null;try{ex=s()}catch(e){}var tu=null;if(ex)for(var i=0;i<(ex.structured_output_nodes||[]).length;i++){var nd=ex.structured_output_nodes[i];if(nd&&nd.type===10&&nd.token_usage){tu=nd.token_usage;break}}if(!tu)return;var total=tu.input_tokens;var parts=[];var ik=fmtK(tu.input_tokens);if(ik!=null)parts.push("↑"+ik);var okv=fmtK(tu.output_tokens);if(okv!=null)parts.push("↓"+okv);var cr=pct(tu.cache_read_input_tokens,total);if(cr!=null)parts.push("缓存读 "+cr+"%");var cw=pct(tu.cache_creation_input_tokens,total);if(cw!=null)parts.push("缓存写 "+cw+"%");if(parts.length===0)return;var txt="ⓘ "+parts.join(" · ");if(txt===last)return;last=txt;var p=o.parentNode;if(!p)return;var el=null;for(var j=0;j<p.childNodes.length;j++){var ch=p.childNodes[j];if(ch&&ch.nodeType===1&&ch.getAttribute&&ch.getAttribute("data-byok-token-usage")){el=ch;break}}if(!el){el=document.createElement("div");el.setAttribute("data-byok-token-usage","1");el.style.cssText="box-sizing:border-box;padding:3px 12px 4px 16px;font-size:11px;line-height:1.4;color:var(--vscode-descriptionForeground,#9d9d9d);opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";p.insertBefore(el,o.nextSibling||null)}el.textContent=txt},500)})()`;
}

function assertTokenUsageAsset(src, filePath) {
  const s = String(src || "");
  const label = `${PATCH_LABEL}: ${filePath}`;
  if (!s.includes(TOKEN_USAGE_PATCH_MARKER)) throw new Error(`${label}: marker missing after patch`);
  if (!s.includes('data-byok-token-usage')) throw new Error(`${label}: token usage DOM injection missing`);
}

function patchWebviewTokenUsageAsset(filePath) {
  const { original, alreadyPatched } = loadPatchText(filePath, { marker: TOKEN_USAGE_PATCH_MARKER });
  if (alreadyPatched) {
    assertTokenUsageAsset(original, filePath);
    return { changed: false, reason: "already_patched" };
  }

  // 锚点：assistant 消息气泡组件（nS）的挂载收尾。
  // 在该点注入一个自包含 IIFE，闭包捕获组件作用域内的 o（挂载点）与 s()（exchange getter）。
  const anchor = /s\(\)&&s\(\)\.status===es\.failed&&\$\(I\)\}\),n\(o,m\),he\(\),a\(\)/g;
  const injection = buildTokenUsageInjection();

  let out = replaceOnceRegex(original, anchor, (m) => {
    const raw = String(m[0] || "");
    return raw.replace(/\),he\(\),a\(\)/, `),${injection},he(),a()`);
  }, PATCH_LABEL);

  const saved = savePatchText(filePath, out, { marker: TOKEN_USAGE_PATCH_MARKER });
  assertTokenUsageAsset(saved, filePath);
  return { changed: true, reason: "patched" };
}

function patchWebviewTokenUsage(extensionDir) {
  const candidates = listWebviewTokenUsageAssets(extensionDir, "patchWebviewTokenUsage");
  const results = [];
  for (const filePath of candidates) results.push({ filePath, ...patchWebviewTokenUsageAsset(filePath) });
  return { changed: results.some((r) => r.changed), results };
}

module.exports = { patchWebviewTokenUsage, buildTokenUsageInjection };

if (require.main === module) {
  const extensionDir = process.argv[2];
  if (!extensionDir) {
    console.error(`usage: ${path.basename(process.argv[1])} <extensionDir>`);
    process.exit(2);
  }
  patchWebviewTokenUsage(extensionDir);
}
