"use strict";

const { normalizeString } = require("../../infra/util");
const { truncateText, truncateTextMiddle } = require("../../infra/text");

const TOOL_RESULT_MISSING_MESSAGE =
  "No corresponding tool_result received (the tool may not have executed, was disabled, had insufficient permissions, or was lost in history). Please continue reasoning without this result or avoid depending on this tool.";

function normalizeRole(v) {
  return normalizeString(v).toLowerCase();
}

function safeJsonStringify(value, fallbackText) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return typeof fallbackText === "string" ? fallbackText : String(fallbackText ?? "");
  }
}

function buildMissingToolResultContent({ idKey, id, toolName, message, args, inputKey, input, maxArgsLen } = {}) {
  const payload = {
    error: "tool_result_missing",
    [String(idKey || "id")]: String(id || ""),
    tool_name: normalizeString(toolName) || undefined,
    message: normalizeString(message) || TOOL_RESULT_MISSING_MESSAGE
  };
  const argText = normalizeString(args);
  const maxLen = Number.isFinite(Number(maxArgsLen)) ? Number(maxArgsLen) : 4000;
  if (argText) payload.arguments = truncateText(argText, maxLen);

  const k = normalizeString(inputKey);
  if (k && input && typeof input === "object" && !Array.isArray(input)) payload[k] = input;

  return safeJsonStringify(payload, String(payload.message || "tool_result_missing"));
}

function buildOrphanToolResultAsUserContent({ kind, idLabel, id, content, maxLen } = {}) {
  const n = Number.isFinite(Number(maxLen)) ? Number(maxLen) : 8000;
  const label = normalizeString(kind) || "orphan_tool_result";
  const idKey = normalizeString(idLabel) || "id";
  const idText = normalizeString(id);
  const body = truncateTextMiddle(typeof content === "string" ? content : String(content ?? ""), n).trim();
  const header = idText ? `[${label} ${idKey}=${idText}]` : `[${label}]`;
  return body ? `${header}\n${body}` : header;
}

module.exports = { TOOL_RESULT_MISSING_MESSAGE, normalizeRole, safeJsonStringify, buildMissingToolResultContent, buildOrphanToolResultAsUserContent };
