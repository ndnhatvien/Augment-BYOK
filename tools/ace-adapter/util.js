"use strict";

function normalizeString(value) {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    const s = normalizeString(item);
    if (s) out.push(s);
  }
  return out;
}

module.exports = { normalizeString, normalizeStringList };
