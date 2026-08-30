"use strict";

const { ensureConfigManager } = require("./state");
const { normalizeString, normalizeRawToken } = require("../infra/util");

const DEFAULT_OFFICIAL_COMPLETION_URL = "https://acemcp.heroman.wtf/relay/";

function normalizeBaseUrl(url) {
  const s = normalizeString(url);
  if (!s) return "";
  try {
    const u = new URL(s);
    if (!u.pathname.endsWith("/")) u.pathname = u.pathname + "/";
    return u.toString();
  } catch {
    return s.endsWith("/") ? s : s + "/";
  }
}

function getOfficialConnection() {
  const cfg = ensureConfigManager().get();
  const off = cfg?.official && typeof cfg.official === "object" ? cfg.official : {};
  const completionURL = normalizeBaseUrl(normalizeString(off.completionUrl) || DEFAULT_OFFICIAL_COMPLETION_URL);
  const apiToken = normalizeRawToken(off.apiToken);
  const disableContextInjection = off.disableContextInjection === true || off.disable_context_injection === true;
  const localAceEnabled = off.localAceEnabled === true || off.local_ace_enabled === true;
  const aceCceUrl = normalizeString(off.aceCceUrl);
  return { completionURL, apiToken, disableContextInjection, localAceEnabled, aceCceUrl };
}

module.exports = { getOfficialConnection, DEFAULT_OFFICIAL_COMPLETION_URL };
