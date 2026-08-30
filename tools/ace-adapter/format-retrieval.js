"use strict";

const { normalizeString, normalizeStringList } = require("./util");

const DEFAULT_MAX_OUTPUT_LENGTH = 20000;

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

function normalizeFormattedRetrievalResponse(json) {
  if (!json || typeof json !== "object") return "";
  return normalizeString(json.formatted_retrieval ?? json.formattedRetrieval ?? "");
}

module.exports = {
  DEFAULT_MAX_OUTPUT_LENGTH,
  buildFormattedRetrieval,
  formatRetrievalResult,
  normalizeFormattedRetrievalResponse
};
