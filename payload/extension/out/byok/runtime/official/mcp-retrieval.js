"use strict";

/**
 * MCP Context Injection
 * Injects MCP-retrieved context into Augment request flow
 */

const { debug, warn } = require("../../infra/log");
const { normalizeString } = require("../../infra/util");
const { makeTextRequestNode, pickInjectionTargetArray } = require("./common");

let _mcpClient = null;

function setMcpClient(client) {
  _mcpClient = client;
}

function getMcpClient() {
  return _mcpClient;
}

async function maybeInjectMcpContext({ req, timeoutMs, abortSignal, mcpConfig }) {
  if (!req || typeof req !== "object") return false;
  if (!mcpConfig || !mcpConfig.enabled) return false;
  if (req.disable_retrieval === true) return false;

  const mcpClient = getMcpClient();
  if (!mcpClient) {
    debug("mcpContext skipped: client not initialized");
    return false;
  }

  const message = normalizeString(req?.message);
  if (!message) {
    debug("mcpContext skipped: no message");
    return false;
  }

  try {
    const hardTimeout = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0 ? Number(timeoutMs) : 120000;
    const t = Math.max(2000, Math.min(8000, Math.floor(hardTimeout * 0.3))); // 30% of total timeout

    const context = await mcpClient.getContext({
      query: message,
      workspacePath: req.path,
      language: req.lang,
      timeout: t
    });

    if (!context || !normalizeString(context.text)) {
      debug("mcpContext skipped: no context returned");
      return false;
    }

    const target = pickInjectionTargetArray(req);
    if (!target) {
      debug("mcpContext skipped: no injection target");
      return false;
    }

    // Build context node with metadata
    const sourcesInfo = context.sources
      .map((s) => `${s.server}:${s.source}${s.promptName ? `:${s.promptName}` : ""}`)
      .join(", ");

    const mcpNode = makeTextRequestNode({
      id: -25,
      text: `[MCP_CONTEXT from ${sourcesInfo}]\n${context.text}\n[/MCP_CONTEXT]`
    });

    // Injection position based on config
    const position = normalizeString(mcpConfig.injectPosition) || "before";

    if (position === "after") {
      // After official retrieval nodes
      target.push(mcpNode);
    } else if (position === "replace") {
      // Remove official retrieval nodes and add MCP
      const filtered = target.filter((n) => {
        const id = Number(n?.id);
        return id !== -20 && id !== -21; // Remove codebase-retrieval (-20) and external-sources (-21)
      });
      filtered.push(mcpNode);
      target.length = 0;
      target.push(...filtered);
    } else {
      // Default: before official retrieval (-20)
      const idx = target.findIndex((n) => Number(n?.id) === -20);
      if (idx >= 0) {
        target.splice(idx, 0, mcpNode);
      } else {
        target.push(mcpNode);
      }
    }

    debug(
      `mcpContext injected: chars=${context.text.length} sources=${context.sources.length} position=${position} target_len=${target.length}`
    );
    return true;
  } catch (err) {
    warn(`mcpContext failed (ignored): ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

module.exports = {
  maybeInjectMcpContext,
  setMcpClient,
  getMcpClient
};
