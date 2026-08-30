"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const { warn } = require("../../infra/log");
const { normalizeString, normalizeStringList } = require("../../infra/util");
const { getOfficialConnection } = require("../../config/official");
const { joinBaseUrl, safeFetch } = require("../../providers/http");
const { readHttpErrorDetail } = require("../../providers/request-util");

const DEFAULT_CCE_URL = "http://127.0.0.1:8765";
const DEFAULT_CCE_TIMEOUT_MS = 8000;
const DEFAULT_TOP_K = 10;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.2;
const DEFAULT_MAX_OUTPUT_LENGTH = 20000;
const DEFAULT_CCE_STORAGE_ROOT = path.join(os.homedir(), ".cce", "projects");

function resolveLocalAceConnection() {
  const off = getOfficialConnection();
  if (off.localAceEnabled !== true) return null;
  const cceUrl = normalizeString(off.aceCceUrl) || DEFAULT_CCE_URL;
  return { cceUrl };
}

function computeCceProjectSlug(projectDir) {
  let resolved = "";
  try {
    resolved = fs.realpathSync.native ? fs.realpathSync.native(projectDir) : fs.realpathSync(projectDir);
  } catch {
    resolved = String(projectDir);
  }
  const absPath = resolved;
  const h = crypto.createHash("sha256").update(absPath, "utf8").digest("hex").slice(0, 6);
  const name = path.basename(absPath);
  let safe = "";
  for (const c of name) {
    const code = c.codePointAt(0);
    const isAscii = code !== undefined && code < 128;
    const isAlnum = /^[A-Za-z0-9]$/.test(c);
    safe += isAscii && (isAlnum || c === "-" || c === "_") ? c : "-";
  }
  return `${safe || "project"}-${h}`;
}

function resolveCceStorageRoot() {
  const cfgPath = path.join(os.homedir(), ".cce", "config.yaml");
  let storage = DEFAULT_CCE_STORAGE_ROOT;
  try {
    const text = fs.readFileSync(cfgPath, "utf8");
    const flat = String(text.match(/^\s*storage_path\s*:\s*(.+)$/m)?.[1] || "").trim();
    const nested = String(text.match(/^\s*storage\s*:\s*$/m) ? text.match(/^\s*storage\s*:\s*\n(?:\s+path\s*:\s*([^\n]+))?/m)?.[1] || "" : "").trim();
    const picked = flat || nested;
    if (picked && (picked.startsWith("/") || picked.startsWith("~") || picked.match(/^[A-Za-z]:[\\/]/))) {
      storage = picked.replace(/^~(?=$|[/\\])/, os.homedir());
    }
  } catch {
    storage = DEFAULT_CCE_STORAGE_ROOT;
  }
  return storage;
}

function resolveLocalAceWorkspaceFolders() {
  try {
    const vscode = require("vscode");
    const ws = vscode && vscode.workspace ? vscode.workspace : null;
    if (!ws) return null;
    const folders = Array.isArray(ws.workspaceFolders) ? ws.workspaceFolders : [];
    const paths = [];
    for (const f of folders) {
      const p = f && f.uri && typeof f.uri.fsPath === "string" ? f.uri.fsPath : "";
      if (p) paths.push(p);
    }
    if (paths.length === 0 && typeof ws.rootPath === "string" && ws.rootPath) paths.push(ws.rootPath);
    return paths;
  } catch {
    return null;
  }
}

function readCceIndexProjectDir(storageRoot, slug) {
  try {
    const metaPath = path.join(storageRoot, slug, "meta.json");
    const text = fs.readFileSync(metaPath, "utf8");
    const meta = JSON.parse(text);
    return normalizeString(meta && meta.project_dir);
  } catch {
    return "";
  }
}

function resolveLocalAceWorkspaceIndexMatch({ workspaceFolders, storageRoot } = {}) {
  const folders = Array.isArray(workspaceFolders) && workspaceFolders.length
    ? workspaceFolders
    : resolveLocalAceWorkspaceFolders();
  if (!Array.isArray(folders) || folders.length === 0) return null;
  const root = normalizeString(storageRoot) || resolveCceStorageRoot();
  for (const folder of folders) {
    const p = typeof folder === "string" ? folder : (folder && folder.uri && typeof folder.uri.fsPath === "string" ? folder.uri.fsPath : "");
    if (!normalizeString(p)) continue;
    let resolvedWs = "";
    try {
      resolvedWs = fs.realpathSync.native ? fs.realpathSync.native(p) : fs.realpathSync(p);
    } catch {
      resolvedWs = p;
    }
    const slug = computeCceProjectSlug(p);
    const indexDir = readCceIndexProjectDir(root, slug);
    if (!normalizeString(indexDir)) continue;
    let resolvedIndex = "";
    try {
      resolvedIndex = fs.realpathSync.native ? fs.realpathSync.native(indexDir) : fs.realpathSync(indexDir);
    } catch {
      resolvedIndex = indexDir;
    }
    if (resolvedWs === resolvedIndex) return true;
  }
  return false;
}

function buildCceSearchPayload({ query, topK, confidenceThreshold } = {}) {
  const q = normalizeString(query);
  const topKNumber = Number(topK);
  const top_k = Number.isFinite(topKNumber) && topKNumber > 0 ? Math.min(100, Math.max(1, Math.floor(topKNumber))) : DEFAULT_TOP_K;
  const conf = Number(confidenceThreshold);
  const confidence_threshold = Number.isFinite(conf) && conf > 0 ? Math.min(1, Math.max(0, conf)) : DEFAULT_CONFIDENCE_THRESHOLD;
  return { query: q, top_k, confidence_threshold };
}

function normalizeCceResults(raw) {
  const r = raw && typeof raw === "object" ? raw : null;
  const list = Array.isArray(r && r.results) ? r.results : [];
  const out = [];
  for (const it of list) {
    if (!it || typeof it !== "object") continue;
    const filePath = normalizeString(it.file_path ?? it.filePath ?? it.path ?? "");
    const content = normalizeString(it.content ?? it.text ?? "");
    if (!filePath && !content) continue;
    const startLine = Number(it.start_line ?? it.startLine ?? it.start_line_number);
    const endLine = Number(it.end_line ?? it.endLine ?? it.end_line_number);
    out.push({
      id: normalizeString(it.id),
      filePath,
      startLine: Number.isFinite(startLine) ? startLine : 0,
      endLine: Number.isFinite(endLine) ? endLine : 0,
      content,
      chunkType: normalizeString(it.chunk_type ?? it.chunkType ?? it.type ?? ""),
      language: normalizeString(it.language ?? ""),
      confidenceScore: Number(it.confidence_score ?? it.confidenceScore ?? it.score),
      metadata: it.metadata && typeof it.metadata === "object" ? it.metadata : null
    });
  }
  return out;
}

function formatRetrievalResult(result) {
  const r = result && typeof result === "object" ? result : null;
  if (!r) return "";
  const filePath = normalizeString(r.filePath);
  const content = normalizeString(r.content);
  if (!filePath && !content) return "";

  const lines = [];
  const headerParts = [];
  if (filePath) headerParts.push(filePath);
  if (Number.isFinite(Number(r.startLine)) && Number(r.startLine) > 0 && Number.isFinite(Number(r.endLine)) && Number(r.endLine) >= Number(r.startLine)) {
    headerParts.push(`lines ${r.startLine}-${r.endLine}`);
  }
  if (normalizeString(r.language)) headerParts.push(`lang=${normalizeString(r.language)}`);
  if (Number.isFinite(Number(r.confidenceScore))) headerParts.push(`conf=${Number(r.confidenceScore).toFixed(3)}`);
  if (headerParts.length) lines.push(headerParts.join(" | "));
  if (content) lines.push(content);
  return lines.join("\n").trim();
}

function buildFormattedRetrieval({ results, informationRequest, blobNames, maxOutputLength } = {}) {
  const blocks = [];
  const info = normalizeString(informationRequest);
  if (info) blocks.push(`[CODEBASE_RETRIEVAL] request: ${info}`);
  const blobList = normalizeStringList(blobNames);
  if (blobList.length) blocks.push(`[CODEBASE_RETRIEVAL] blobs: ${blobList.join(", ")}`);

  for (const result of Array.isArray(results) ? results : []) {
    const block = formatRetrievalResult(result);
    if (block) blocks.push(block);
  }

  const joined = blocks.join("\n\n").trim();
  const limit = Number(maxOutputLength);
  const maxLen = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_MAX_OUTPUT_LENGTH;
  if (joined.length <= maxLen) return joined;
  return joined.slice(0, maxLen);
}

function normalizeBlobNames(blobs) {
  if (!blobs || typeof blobs !== "object") return [];
  const names = [];
  for (const key of ["added_blobs", "deleted_blobs", "addedBlobs", "deletedBlobs"]) {
    const arr = Array.isArray(blobs[key]) ? blobs[key] : [];
    names.push(...normalizeStringList(arr));
  }
  return [...new Set(names)];
}

async function searchCce({ query, topK, confidenceThreshold, timeoutMs, abortSignal, cceUrl }) {
  const q = normalizeString(query);
  if (!q) return [];
  const url = joinBaseUrl(normalizeString(cceUrl) || DEFAULT_CCE_URL, "search");
  if (!url) throw new Error("local ACE CCE URL 无效（无法请求 /search）");

  const payload = buildCceSearchPayload({ query: q, topK, confidenceThreshold });
  const resp = await safeFetch(
    url,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) },
    { timeoutMs: timeoutMs || DEFAULT_CCE_TIMEOUT_MS, abortSignal, label: "local-ace/cce-search" }
  );
  if (!resp.ok) {
    const text = String(await readHttpErrorDetail(resp, { maxChars: 300 }) || "").trim();
    throw new Error(`CCE /search ${resp.status}: ${text}`.trim());
  }
  const json = await resp.json().catch(() => null);
  if (!json || typeof json !== "object") return [];
  return normalizeCceResults(json);
}

async function fetchLocalCodebaseRetrieval({ cceUrl, informationRequest, blobs, maxOutputLength, timeoutMs, abortSignal } = {}) {
  const info = normalizeString(informationRequest);
  if (!info) return "";
  const results = await searchCce({ query: info, cceUrl, timeoutMs, abortSignal });
  return buildFormattedRetrieval({
    results,
    informationRequest: info,
    blobNames: normalizeBlobNames(blobs),
    maxOutputLength
  });
}

module.exports = {
  DEFAULT_CCE_URL,
  buildCceSearchPayload,
  normalizeCceResults,
  buildFormattedRetrieval,
  formatRetrievalResult,
  normalizeBlobNames,
  searchCce,
  fetchLocalCodebaseRetrieval,
  resolveLocalAceConnection,
  computeCceProjectSlug,
  resolveCceStorageRoot,
  resolveLocalAceWorkspaceIndexMatch
};
