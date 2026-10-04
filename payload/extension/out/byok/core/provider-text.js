"use strict";

const { normalizeString } = require("../infra/util");
const { formatKnownProviderTypes } = require("./provider-types");

const { openAiCompleteText, openAiStreamTextDeltas } = require("../providers/openai");
const { openAiResponsesCompleteText, openAiResponsesStreamTextDeltas } = require("../providers/openai-responses");
const { anthropicCompleteText, anthropicStreamTextDeltas } = require("../providers/anthropic");
const { geminiCompleteText, geminiStreamTextDeltas } = require("../providers/gemini");

function asOpenAiMessages(system, messages) {
  const sys = typeof system === "string" ? system : "";
  const ms = Array.isArray(messages) ? messages : [];
  return [{ role: "system", content: sys }, ...ms].filter((m) => m && typeof m.content === "string" && m.content);
}

function asAnthropicMessages(system, messages) {
  const sys = normalizeString(system);
  const ms = Array.isArray(messages) ? messages : [];
  const out = ms
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content)
    .map((m) => ({ role: m.role, content: m.content }));
  return { system: sys, messages: out };
}

function asGeminiContents(system, messages) {
  const sys = normalizeString(system);
  const ms = Array.isArray(messages) ? messages : [];
  const contents = [];
  for (const m of ms) {
    if (!m || typeof m !== "object") continue;
    const role = m.role === "assistant" ? "model" : m.role === "user" ? "user" : "";
    const content = typeof m.content === "string" ? m.content : "";
    if (!role || !content) continue;
    contents.push({ role, parts: [{ text: content }] });
  }
  return { systemInstruction: sys, contents };
}

function asOpenAiResponsesInput(system, messages) {
  const sys = normalizeString(system);
  const ms = Array.isArray(messages) ? messages : [];
  const input = [];
  for (const m of ms) {
    if (!m || typeof m !== "object") continue;
    const role = m.role === "assistant" ? "assistant" : m.role === "user" ? "user" : "";
    const content = typeof m.content === "string" ? m.content : "";
    if (!role || !content) continue;
    input.push({ type: "message", role, content });
  }
  return { instructions: sys, input };
}

async function completeTextByProviderType({
  type,
  baseUrl,
  apiKey,
  model,
  system,
  messages,
  timeoutMs,
  abortSignal,
  extraHeaders,
  requestDefaults
}) {
  const t = normalizeString(type);
  if (t === "openai_compatible") {
    return await openAiCompleteText({
      baseUrl,
      apiKey,
      model,
      messages: asOpenAiMessages(system, messages),
      timeoutMs,
      abortSignal,
      extraHeaders,
      requestDefaults
    });
  }
  if (t === "anthropic") {
    const { system: sys, messages: msgs } = asAnthropicMessages(system, messages);
    return await anthropicCompleteText({ baseUrl, apiKey, model, system: sys, messages: msgs, timeoutMs, abortSignal, extraHeaders, requestDefaults });
  }
  if (t === "openai_responses") {
    const { instructions, input } = asOpenAiResponsesInput(system, messages);
    return await openAiResponsesCompleteText({ baseUrl, apiKey, model, instructions, input, timeoutMs, abortSignal, extraHeaders, requestDefaults });
  }
  if (t === "gemini_ai_studio") {
    const { systemInstruction, contents } = asGeminiContents(system, messages);
    return await geminiCompleteText({ baseUrl, apiKey, model, systemInstruction, contents, timeoutMs, abortSignal, extraHeaders, requestDefaults });
  }
  throw new Error(`Unknown provider.type: ${t} (supported: ${formatKnownProviderTypes()})`);
}

async function* streamTextDeltasByProviderType({
  type,
  baseUrl,
  apiKey,
  model,
  system,
  messages,
  timeoutMs,
  abortSignal,
  extraHeaders,
  requestDefaults
}) {
  const t = normalizeString(type);
  if (t === "openai_compatible") {
    yield* openAiStreamTextDeltas({
      baseUrl,
      apiKey,
      model,
      messages: asOpenAiMessages(system, messages),
      timeoutMs,
      abortSignal,
      extraHeaders,
      requestDefaults
    });
    return;
  }
  if (t === "anthropic") {
    const { system: sys, messages: msgs } = asAnthropicMessages(system, messages);
    yield* anthropicStreamTextDeltas({ baseUrl, apiKey, model, system: sys, messages: msgs, timeoutMs, abortSignal, extraHeaders, requestDefaults });
    return;
  }
  if (t === "openai_responses") {
    const { instructions, input } = asOpenAiResponsesInput(system, messages);
    yield* openAiResponsesStreamTextDeltas({ baseUrl, apiKey, model, instructions, input, timeoutMs, abortSignal, extraHeaders, requestDefaults });
    return;
  }
  if (t === "gemini_ai_studio") {
    const { systemInstruction, contents } = asGeminiContents(system, messages);
    yield* geminiStreamTextDeltas({ baseUrl, apiKey, model, systemInstruction, contents, timeoutMs, abortSignal, extraHeaders, requestDefaults });
    return;
  }
  throw new Error(`Unknown provider.type: ${t} (supported: ${formatKnownProviderTypes()})`);
}

module.exports = {
  asOpenAiMessages,
  asAnthropicMessages,
  asGeminiContents,
  asOpenAiResponsesInput,
  completeTextByProviderType,
  streamTextDeltasByProviderType
};
