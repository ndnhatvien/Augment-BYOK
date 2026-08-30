"use strict";

const { request } = require("http");
const { normalizeString, normalizeStringList } = require("./util");

const DEFAULT_CCE_BASE_URL = "http://127.0.0.1:8765";
const DEFAULT_CCE_TIMEOUT_MS = 8000;

function buildCceSearchPayload({ query, topK, confidenceThreshold } = {}) {
  const q = normalizeString(query);
  const topKNumber = Number(topK);
  const top_k = Number.isFinite(topKNumber) && topKNumber > 0 ? Math.min(100, Math.max(1, Math.floor(topKNumber))) : 10;
  const conf = Number(confidenceThreshold);
  const confidence_threshold = Number.isFinite(conf) && conf > 0 ? Math.min(1, Math.max(0, conf)) : 0.2;
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

function parseJsonBody(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function postJson({ baseUrl, path, headers, body }) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(baseUrl);
    } catch (err) {
      reject(new Error(`invalid CCE baseUrl: ${String(err.message || err)}`));
      return;
    }
    const payload = JSON.stringify(body);
    const req = request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path,
        method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload), ...(headers || {}) }
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => {
          resolve({ status: res.statusCode || 0, text });
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.setTimeout(parseTimeout(), () => {
      req.destroy(new Error("CCE search timed out"));
    });
    req.end(payload);
  });
}

function parseTimeout() {
  const env = Number(process.env.ACE_CCE_TIMEOUT_MS);
  return Number.isFinite(env) && env > 0 ? Math.floor(env) : DEFAULT_CCE_TIMEOUT_MS;
}

function cceBaseUrlFromEnv() {
  return normalizeString(process.env.ACE_CCE_URL) || DEFAULT_CCE_BASE_URL;
}

function cceTokenFromEnv() {
  return normalizeString(process.env.ACE_CCE_TOKEN);
}

async function searchCce({ query, topK, confidenceThreshold, baseUrl, token, timeoutMs, signal } = {}) {
  const q = normalizeString(query);
  if (!q) return [];
  const url = normalizeString(baseUrl) || cceBaseUrlFromEnv();
  const bearer = normalizeString(token || cceTokenFromEnv());
  const headers = {};
  if (bearer) headers.authorization = `Bearer ${bearer}`;

  const response = await postJson({
    baseUrl: url,
    path: "/search",
    headers,
    body: buildCceSearchPayload({ query: q, topK, confidenceThreshold }),
    timeoutMs
  });

  const status = response.status;
  if (status < 200 || status >= 300) {
    const detail = normalizeString(response.text).slice(0, 300) || `status ${status}`;
    throw new Error(`CCE /search failed: ${detail}`);
  }
  if (signal && signal.aborted) return [];
  const json = parseJsonBody(response.text);
  if (!json || typeof json !== "object") return [];
  return normalizeCceResults(json);
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

function buildInformationRequest(payload) {
  const parts = [];
  const info = normalizeString(payload && payload.information_request);
  if (info) parts.push(info);
  const dialog = Array.isArray(payload && payload.dialog) ? payload.dialog : [];
  for (const turn of dialog) {
    if (!turn || typeof turn !== "object") continue;
    for (const key of ["user", "assistant", "message", "text", "content"]) {
      const t = normalizeString(turn[key]);
      if (t) {
        parts.push(t);
        break;
      }
    }
  }
  return parts.join("\n\n").trim();
}

module.exports = {
  DEFAULT_CCE_BASE_URL,
  buildCceSearchPayload,
  normalizeCceResults,
  buildInformationRequest,
  normalizeBlobNames,
  searchCce,
  cceBaseUrlFromEnv,
  cceTokenFromEnv
};
