"use strict";

/**
 * MCP Client
 * High-level client for querying MCP servers and building context
 */

const { debug, warn } = require("../infra/log");
const { normalizeString } = require("../infra/util");
const { McpServerManager } = require("./server-manager");

class McpClient {
  constructor(serverConfigs = []) {
    this.serverConfigs = Array.isArray(serverConfigs) ? serverConfigs : [];
    this.serverManager = new McpServerManager();
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    debug(`[mcp] Initializing ${this.serverConfigs.length} servers`);

    const results = await Promise.allSettled(
      this.serverConfigs.map((cfg) => this.serverManager.startServer(cfg))
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected");

    if (failed.length > 0) {
      for (const result of failed) {
        warn(`[mcp] Server init failed:`, result.reason?.message || String(result.reason));
      }
    }

    if (succeeded === 0) {
      throw new Error("All MCP servers failed to initialize");
    }

    this.initialized = true;
    debug(`[mcp] Initialized: ${succeeded}/${this.serverConfigs.length} servers ready`);
  }

  async getContext({ query, workspacePath, language, timeout = 8000 }) {
    if (!this.initialized) {
      throw new Error("MCP client not initialized");
    }

    const servers = this.serverManager.getAllServers();
    if (servers.length === 0) {
      return { text: "", sources: [] };
    }

    const results = await Promise.allSettled(
      servers.map((server) =>
        this._queryServer(server, { query, workspacePath, language, timeout })
      )
    );

    const contexts = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled" && result.value) {
        contexts.push(result.value);
      } else if (result.status === "rejected") {
        warn(`[mcp] Query failed for ${servers[i].name}:`, result.reason?.message);
      }
    }

    return this._mergeContexts(contexts);
  }

  async _queryServer(server, { query, workspacePath, language, timeout }) {
    const timeoutMs = Math.floor(timeout / this.serverManager.getAllServers().length);

    // Strategy 1: Try prompts/get if server has prompts capability
    if (server.capabilities?.prompts) {
      try {
        const promptResult = await this._queryViaPrompts(server, {
          query,
          workspacePath,
          language,
          timeoutMs
        });
        if (promptResult) return promptResult;
      } catch (err) {
        debug(`[mcp] ${server.name} prompts/get failed:`, err.message);
      }
    }

    // Strategy 2: Try resources/read if server has resources capability
    if (server.capabilities?.resources) {
      try {
        const resourceResult = await this._queryViaResources(server, {
          query,
          workspacePath,
          language,
          timeoutMs
        });
        if (resourceResult) return resourceResult;
      } catch (err) {
        debug(`[mcp] ${server.name} resources/read failed:`, err.message);
      }
    }

    return null;
  }

  async _queryViaPrompts(server, { query, workspacePath, language, timeoutMs }) {
    const prompts = await server.call("prompts/list", {}, { timeoutMs: 2000 });
    if (!prompts?.prompts || prompts.prompts.length === 0) return null;

    // Find relevant prompt (simple heuristic)
    const relevantPrompt = prompts.prompts[0]; // For POC, just use first prompt

    const result = await server.call(
      "prompts/get",
      {
        name: relevantPrompt.name,
        arguments: {
          query: query || "",
          path: workspacePath || "",
          language: language || ""
        }
      },
      { timeoutMs }
    );

    if (!result?.messages || result.messages.length === 0) return null;

    const text = result.messages
      .map((msg) => {
        if (msg.content?.type === "text") return msg.content.text;
        if (typeof msg.content === "string") return msg.content;
        return "";
      })
      .filter(Boolean)
      .join("\n\n");

    return {
      source: "prompt",
      server: server.name,
      promptName: relevantPrompt.name,
      text
    };
  }

  async _queryViaResources(server, { query, workspacePath, timeoutMs }) {
    const resources = await server.call("resources/list", {}, { timeoutMs: 2000 });
    if (!resources?.resources || resources.resources.length === 0) return null;

    // Filter resources (simple heuristic: path-based)
    const relevantResources = resources.resources.filter((r) => {
      if (!workspacePath) return true;
      const uri = normalizeString(r.uri);
      return uri.includes(workspacePath) || workspacePath.includes(uri.split("file://")[1]);
    }).slice(0, 10); // Limit to 10 resources

    if (relevantResources.length === 0) return null;

    const contents = await Promise.allSettled(
      relevantResources.map((r) =>
        server.call("resources/read", { uri: r.uri }, { timeoutMs: Math.floor(timeoutMs / relevantResources.length) })
      )
    );

    const texts = [];
    for (let i = 0; i < contents.length; i++) {
      const result = contents[i];
      if (result.status !== "fulfilled") continue;

      const content = result.value?.contents?.[0];
      if (!content) continue;

      if (content.text) {
        texts.push(`[${relevantResources[i].name || relevantResources[i].uri}]\n${content.text}`);
      } else if (content.blob) {
        texts.push(`[${relevantResources[i].name || relevantResources[i].uri}]\n<binary data: ${content.mimeType || "unknown"}>`);
      }
    }

    if (texts.length === 0) return null;

    return {
      source: "resources",
      server: server.name,
      resourceCount: texts.length,
      text: texts.join("\n\n")
    };
  }

  _mergeContexts(contexts) {
    if (contexts.length === 0) {
      return { text: "", sources: [] };
    }

    const parts = [];
    const sources = [];

    for (const ctx of contexts) {
      if (!ctx || !ctx.text) continue;

      sources.push({
        server: ctx.server,
        source: ctx.source,
        ...(ctx.promptName && { promptName: ctx.promptName }),
        ...(ctx.resourceCount && { resourceCount: ctx.resourceCount })
      });

      parts.push(`[MCP:${ctx.server}:${ctx.source}]\n${ctx.text}\n[/MCP:${ctx.server}]`);
    }

    return {
      text: parts.join("\n\n"),
      sources
    };
  }

  async dispose() {
    await this.serverManager.killAll();
    this.initialized = false;
  }

  getStatus() {
    return {
      initialized: this.initialized,
      configuredCount: this.serverConfigs.length,
      ...this.serverManager.getStatus()
    };
  }
}

module.exports = { McpClient };
