"use strict";

const { joinBaseUrl } = require("../http");
const { normalizeString, requireString, normalizeRawToken, stripByokInternalKeys } = require("../../infra/util");
const { withJsonContentType, openAiAuthHeaders } = require("../headers");
const {
  MAX_TOKENS_ALIAS_KEYS,
  MAX_TOKENS_ALIAS_KEYS_EXCEPT_MAX_OUTPUT_TOKENS,
  pickPositiveIntFromRecord,
  deleteKeysFromRecord
} = require("../request-defaults-util");

function normalizeOpenAiResponsesRequestDefaults(requestDefaults) {
  const raw = requestDefaults && typeof requestDefaults === "object" && !Array.isArray(requestDefaults) ? requestDefaults : {};
  const rd = stripByokInternalKeys(raw);
  const out = { ...rd };

  // 兼容：用户可能写 camelCase；OpenAI 实际使用 snake_case。
  if ("parallelToolCalls" in out) {
    if (!("parallel_tool_calls" in out)) out.parallel_tool_calls = out.parallelToolCalls;
    delete out.parallelToolCalls;
  }

  // 兼容：用户常写 max_tokens/maxTokens；responses API 使用 max_output_tokens。
  // 仅在未显式提供 max_output_tokens 时做映射，避免覆盖用户意图。
  const maxOutput = pickPositiveIntFromRecord(out, MAX_TOKENS_ALIAS_KEYS);
  if (maxOutput != null && out.max_output_tokens == null) out.max_output_tokens = maxOutput;

  // 移除可能导致网关严格校验失败的别名字段（保留标准字段）。
  deleteKeysFromRecord(out, MAX_TOKENS_ALIAS_KEYS_EXCEPT_MAX_OUTPUT_TOKENS);

  return out;
}

function buildMinimalRetryRequestDefaults(requestDefaults) {
  const rd = normalizeOpenAiResponsesRequestDefaults(requestDefaults);
  const out = {};
  const n = Number(rd.max_output_tokens);
  if (Number.isFinite(n) && n > 0) out.max_output_tokens = Math.floor(n);
  return out;
}

function buildOpenAiResponsesRequest({ baseUrl, apiKey, model, instructions, input, tools, extraHeaders, requestDefaults, stream }) {
  const url = joinBaseUrl(requireString(baseUrl, "OpenAI baseUrl"), "responses");
  const key = normalizeRawToken(apiKey);
  const extra = extraHeaders && typeof extraHeaders === "object" ? extraHeaders : {};
  if (!key && Object.keys(extra).length === 0) throw new Error("OpenAI apiKey not configured (and headers are empty)");

  const m = requireString(model, "OpenAI model");
  const rd = normalizeOpenAiResponsesRequestDefaults(requestDefaults);
  const body = { ...rd, model: m, input, stream: Boolean(stream) };
  const ins = normalizeString(instructions);
  if (ins) body.instructions = ins.trim();
  if (Array.isArray(tools) && tools.length) {
    body.tools = tools;
    if (body.tool_choice == null) body.tool_choice = "auto";
  }

  const headers = withJsonContentType(openAiAuthHeaders(key, extraHeaders));
  if (stream) headers.accept = "text/event-stream";
  return { url, headers, body };
}

module.exports = { buildOpenAiResponsesRequest, buildMinimalRetryRequestDefaults };
