"use strict";

const { normalizeString } = require("../../infra/util");
const { joinBaseUrl, safeFetch } = require("../../providers/http");
const { readHttpErrorDetail } = require("../../providers/request-util");

async function fetchOfficialGetModels({ completionURL, apiToken, timeoutMs, abortSignal }) {
  const url = joinBaseUrl(normalizeString(completionURL), "get-models");
  if (!url) throw new Error("Invalid completionURL (cannot request official get-models)");
  const headers = { "content-type": "application/json" };
  if (apiToken) headers.authorization = `Bearer ${apiToken}`;
  const resp = await safeFetch(url, { method: "POST", headers, body: "{}" }, { timeoutMs, abortSignal, label: "augment/get-models" });
  if (!resp.ok) throw new Error(`get-models ${resp.status}: ${await readHttpErrorDetail(resp, { maxChars: 300 })}`.trim());
  const json = await resp.json().catch(() => null);
  if (!json || typeof json !== "object") throw new Error("get-models response is not a JSON object");
  return json;
}

module.exports = { fetchOfficialGetModels };
