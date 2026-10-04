"use strict";

const { warn } = require("../infra/log");
const { normalizeString, safeTransform } = require("../infra/util");

function isTransformFailure(err) {
  const m = err instanceof Error ? err.message : "";
  return typeof m === "string" && m.startsWith("transform failed");
}

function makeEndpointErrorText(ep, err) {
  const label = normalizeString(ep) || "endpoint";
  const msg = err instanceof Error ? err.message : String(err);
  const m = normalizeString(msg) || "unknown error";
  return `❌ ${label} failed: ${m}`.trim();
}

async function* guardObjectStream({ ep, src, transform, makeErrorChunk, logMeta }) {
  try {
    for await (const raw of src) yield safeTransform(transform, raw, ep);
  } catch (err) {
    if (isTransformFailure(err)) throw err;
    if (logMeta && typeof logMeta === "object") warn(makeEndpointErrorText(ep, err), logMeta);
    else warn(makeEndpointErrorText(ep, err));
    const fallback = typeof makeErrorChunk === "function" ? makeErrorChunk(err) : null;
    if (fallback != null) yield safeTransform(transform, fallback, ep);
  }
}

module.exports = { makeEndpointErrorText, guardObjectStream };
