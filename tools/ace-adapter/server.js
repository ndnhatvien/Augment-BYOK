#!/usr/bin/env node
"use strict";

const http = require("http");
const crypto = require("crypto");
const { normalizeString } = require("./util");
const { searchCce, cceBaseUrlFromEnv, buildInformationRequest, normalizeBlobNames } = require("./cce-client");
const { buildFormattedRetrieval } = require("./format-retrieval");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8310;
const MAX_BODY_BYTES = 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseJson(text) {
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
  res.end(text);
}

function bearerToken(req) {
  const header = normalizeString(req.headers.authorization || "");
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice("bearer ".length).trim();
}

function isAuthorized(req, expectedToken) {
  if (!expectedToken) return true;
  const token = bearerToken(req);
  if (!token) return false;
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(expectedToken, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function getEnvNumber(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

async function handleCodebaseRetrieval(req, res) {
  const body = parseJson(await readBody(req));
  const info = buildInformationRequest(body);
  const blobNames = normalizeBlobNames(body.blobs);

  if (!info) {
    sendJson(res, 400, { error: "empty information_request" });
    return;
  }

  const results = await searchCce({
    query: info,
    topK: getEnvNumber("ACE_CCE_TOP_K", 10),
    confidenceThreshold: process.env.ACE_CCE_CONFIDENCE_THRESHOLD
  });

  const formatted = buildFormattedRetrieval({
    results,
    informationRequest: info,
    blobNames,
    maxOutputLength: body.max_output_length
  });

  sendJson(res, 200, { formatted_retrieval: formatted });
}

async function handleContextCanvasList(req, res) {
  await readBody(req);
  sendJson(res, 200, { canvases: [], next_page_token: "" });
}

async function handleExternalSources(req, res) {
  await readBody(req);
  sendJson(res, 200, { sources: [] });
}

async function handleGetModels(req, res) {
  await readBody(req);
  sendJson(res, 200, { default_model: "", models: [], feature_flags: {} });
}

async function handleRequest(req, res, token) {
  const method = normalizeString(req.method).toUpperCase();
  const pathname = normalizeString(req.url || "").split("?")[0];
  const startedAt = Date.now();
  const logLine = () =>
    console.log(`[ace-adapter] ${new Date().toISOString()} ${method} ${pathname} -> ${res.statusCode || 0} (${Date.now() - startedAt}ms)`);

  if (method === "GET" && pathname === "/health") {
    sendJson(res, 200, { ok: true });
    logLine();
    return;
  }
  if (method !== "POST") {
    sendJson(res, 405, { error: "method not allowed" });
    logLine();
    return;
  }
  if (!isAuthorized(req, token)) {
    sendJson(res, 401, { error: "unauthorized" });
    logLine();
    return;
  }

  try {
    if (pathname === "/get-models") return await handleGetModels(req, res);
    if (pathname === "/agents/codebase-retrieval") return await handleCodebaseRetrieval(req, res);
    if (pathname === "/context-canvas/list") return await handleContextCanvasList(req, res);
    if (pathname === "/search-external-sources") return await handleExternalSources(req, res);
    sendJson(res, 404, { error: "not found" });
  } catch (err) {
    sendJson(res, 502, { error: `upstream failure: ${err instanceof Error ? err.message : String(err)}` });
  } finally {
    logLine();
  }
}

function createServer(options = {}) {
  const token = normalizeString(options.token || process.env.ACE_ADAPTER_TOKEN);
  return http.createServer((req, res) => {
    handleRequest(req, res, token).catch(() => {
      sendJson(res, 500, { error: "internal error" });
    });
  });
}

function main() {
  const host = normalizeString(process.env.ACE_ADAPTER_HOST) || DEFAULT_HOST;
  const port = getEnvNumber("ACE_ADAPTER_PORT", DEFAULT_PORT);
  const cceUrl = cceBaseUrlFromEnv();
  const server = createServer();
  server.listen(port, host, () => {
    console.log(`[ace-adapter] listening on http://${host}:${port}`);
    console.log(`[ace-adapter] CCE backend: ${cceUrl}`);
    console.log(`[ace-adapter] endpoints: POST /get-models, POST /agents/codebase-retrieval, POST /context-canvas/list, POST /search-external-sources`);
    console.log(`[ace-adapter] point official.completionUrl to http://${host}:${port} and set official.apiToken`);
  });
}

if (require.main === module) {
  main();
}

module.exports = { createServer, handleRequest, bearerToken };
