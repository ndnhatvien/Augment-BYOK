#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const { ensureMarker, replaceOnceRegex } = require("../lib/patch");

const MARKER = "__augment_byok_webview_history_summary_node_slim_v1";

function patchExtensionClientContextAsset(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("missing file: " + filePath);
  const original = fs.readFileSync(filePath, "utf8");
  if (original.includes(MARKER)) return { changed: false, reason: "already_patched" };

  let out = original;

  const summaryNodeRe = /\{id:0,type:([A-Za-z_$][0-9A-Za-z_$]*)\.HISTORY_SUMMARY,history_summary_node:([A-Za-z_$][0-9A-Za-z_$]*)\}/g;
  out = replaceOnceRegex(
    out,
    summaryNodeRe,
    (m) => "{id:0,type:" + m[1] + ".TEXT,text_node:{content:k3(" + m[2] + ")}}",
    "extension-client-context HISTORY_SUMMARY node slimming"
  );

  out = ensureMarker(out, MARKER);
  fs.writeFileSync(filePath, out, "utf8");
  return { changed: true, reason: "patched" };
}

function patchWebviewHistorySummaryNode(extensionDir) {
  const extDir = path.resolve(String(extensionDir || ""));
  if (!extDir || extDir === path.parse(extDir).root) throw new Error("patchWebviewHistorySummaryNode: invalid extensionDir");

  const assetsDir = path.join(extDir, "common-webviews", "assets");
  if (!fs.existsSync(assetsDir)) throw new Error("webview assets dir missing: " + assetsDir);

  const candidates = fs
    .readdirSync(assetsDir)
    .filter((name) => typeof name === "string" && name.startsWith("extension-client-context-") && name.endsWith(".js"))
    .map((name) => path.join(assetsDir, name));

  if (!candidates.length) throw new Error("extension-client-context asset not found (upstream may have changed)");

  const results = [];
  for (const filePath of candidates) results.push({ filePath, ...patchExtensionClientContextAsset(filePath) });
  return { changed: results.some((r) => r.changed), results };
}

module.exports = { patchWebviewHistorySummaryNode };

if (require.main === module) {
  const extensionDir = process.argv[2];
  if (!extensionDir) {
    console.error("usage: " + path.basename(process.argv[1]) + " <extensionDir>");
    process.exit(2);
  }
  patchWebviewHistorySummaryNode(extensionDir);
}
