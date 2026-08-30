"use strict";

/**
 * MCP Server Manager
 * Handles lifecycle of MCP server processes (spawn, kill, restart)
 */

const { spawn } = require("child_process");
const { EventEmitter } = require("events");
const { debug, info, warn } = require("../infra/log");
const { normalizeString } = require("../infra/util");
const { McpProtocol } = require("./protocol");

class McpServer extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.name = normalizeString(config.name) || "unknown";
    this.process = null;
    this.protocol = null;
    this.initialized = false;
    this.capabilities = {};
    this.tools = [];
    this._lastStderr = "";
    this._exitCode = null;
    this._exitSignal = null;
    this._spawnError = null;
  }

  async start() {
    if (this.process) {
      throw new Error(`MCP server ${this.name} already running`);
    }

    const { command, args = [], env = {} } = this.config;
    if (!command) {
      throw new Error(`MCP server ${this.name} missing command`);
    }

    info(`[mcp] Starting server: ${this.name}`);
    info(`[mcp]   command: ${command}`);
    info(`[mcp]   args: ${JSON.stringify(args)}`);
    info(`[mcp]   full command: ${command} ${args.join(" ")}`);
    debug(`[mcp] Starting server: ${this.name} (${command} ${args.join(" ")})`);

    const spawnOpts = {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    };
    // On Windows, use shell:true for .exe paths that may contain spaces or special chars
    if (process.platform === "win32") {
      spawnOpts.shell = true;
    }

    this.process = spawn(command, args, spawnOpts);

    this.protocol = new McpProtocol({ timeout: 30000 });

    // Wire protocol to process stdio
    this.protocol.on("send", (message) => {
      if (this.process && this.process.stdin.writable) {
        this.process.stdin.write(JSON.stringify(message) + "\n");
      }
    });

    this.process.stdout.on("data", (data) => {
      this.protocol.handleIncoming(data);
    });

    this.process.stderr.on("data", (data) => {
      const msg = data.toString().trim();
      if (msg) {
        debug(`[mcp] ${this.name} stderr: ${msg}`);
        this._lastStderr = msg;
      }
    });

    this.process.on("error", (err) => {
      warn(`[mcp] ${this.name} process error:`, err.message);
      this._spawnError = err;
      if (this.listenerCount("error") > 0) this.emit("error", err);
    });

    this.process.on("exit", (code, signal) => {
      info(`[mcp] ${this.name} exited: code=${code} signal=${signal}`);
      if (this._lastStderr) {
        info(`[mcp] ${this.name} last stderr: ${this._lastStderr}`);
      }
      debug(`[mcp] ${this.name} exited: code=${code} signal=${signal}`);
      this._exitCode = code;
      this._exitSignal = signal;
      this.cleanup();
      this.emit("exit", { code, signal });
    });

    this.protocol.on("error", (err) => {
      warn(`[mcp] ${this.name} protocol error:`, err.message);
    });

    this.protocol.on("notification", (notification) => {
      this.handleNotification(notification);
    });

    // Wait for process to be ready or fail
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => resolve(), 200);
      this.process.once("error", (err) => {
        clearTimeout(timeout);
        reject(new Error(`Process spawn failed: ${err.message}`));
      });
      this.process.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`Process exited immediately with code ${code}`));
      });
    });
  }

  async initialize({ protocolVersion = "2024-11-05", capabilities = {} } = {}) {
    if (this.initialized) {
      return this.capabilities;
    }

    if (!this.protocol) {
      throw new Error(`MCP server ${this.name}: protocol not available (process may have crashed)`);
    }

    let result;
    try {
      result = await this.protocol.sendRequest("initialize", {
        protocolVersion,
        capabilities,
        clientInfo: {
          name: "augment-byok",
          version: "1.0.0"
        }
      });
    } catch (err) {
      const stderr = this._lastStderr || "";
      const exitCode = this._exitCode;
      const detail = stderr ? ` stderr: ${stderr}` : exitCode != null ? ` exit_code=${exitCode}` : "";
      throw new Error(`MCP server ${this.name} initialize failed: ${err.message}${detail}`);
    }

    this.capabilities = result.capabilities || {};
    this.initialized = true;

    // Send initialized notification
    this.protocol.sendNotification("notifications/initialized");

    // Discover available tools
    if (this.capabilities.tools) {
      try {
        const toolsResult = await this.protocol.sendRequest("tools/list", {}, { timeoutMs: 5000 });
        this.tools = Array.isArray(toolsResult?.tools) ? toolsResult.tools : [];
        debug(`[mcp] ${this.name} tools: ${this.tools.length} available`);
      } catch (err) {
        debug(`[mcp] ${this.name} tools/list failed (non-fatal):`, err.message);
        this.tools = [];
      }
    } else {
      this.tools = [];
    }

    debug(`[mcp] ${this.name} initialized:`, JSON.stringify(this.capabilities));
    return this.capabilities;
  }

  async call(method, params = {}, options = {}) {
    if (!this.initialized && method !== "initialize") {
      throw new Error(`MCP server ${this.name} not initialized`);
    }

    return await this.protocol.sendRequest(method, params, options);
  }

  handleNotification(notification) {
    const { method, params } = notification;
    debug(`[mcp] ${this.name} notification: ${method}`, params);
    this.emit("notification", { method, params });
  }

  async kill() {
    if (!this.process) return;

    debug(`[mcp] Killing server: ${this.name}`);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.process) {
          this.process.kill("SIGKILL");
        }
        resolve();
      }, 5000);

      this.process.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });

      this.process.kill("SIGTERM");
    });
  }

  cleanup() {
    if (this.protocol) {
      this.protocol.reset();
      this.protocol.removeAllListeners();
      this.protocol = null;
    }
    if (this.process) {
      this.process.removeAllListeners();
      this.process = null;
    }
    this.initialized = false;
    this.capabilities = {};
    this.tools = [];
  }

  isRunning() {
    return this.process !== null && !this.process.killed;
  }

  getInfo() {
    return {
      name: this.name,
      running: this.isRunning(),
      initialized: this.initialized,
      capabilities: { ...this.capabilities },
      tools: this.tools.map((t) => ({ name: t.name, description: t.description || "" })),
      toolCount: this.tools.length
    };
  }
}

class McpServerManager {
  constructor() {
    this.servers = new Map();
  }

  async startServer(config) {
    const name = normalizeString(config.name) || "unnamed";

    if (this.servers.has(name)) {
      throw new Error(`MCP server ${name} already exists`);
    }

    const server = new McpServer(config);
    await server.start();
    await server.initialize({
      capabilities: {
        resources: {},
        prompts: {},
        tools: {}
      }
    });

    this.servers.set(name, server);
    return server;
  }

  getServer(name) {
    return this.servers.get(name);
  }

  getAllServers() {
    return Array.from(this.servers.values());
  }

  async killServer(name) {
    const server = this.servers.get(name);
    if (!server) return;

    await server.kill();
    this.servers.delete(name);
  }

  async killAll() {
    const promises = [];
    for (const server of this.servers.values()) {
      promises.push(server.kill());
    }
    await Promise.all(promises);
    this.servers.clear();
  }

  getStatus() {
    const servers = [];
    for (const server of this.servers.values()) {
      servers.push(server.getInfo());
    }
    return { serverCount: servers.length, servers };
  }
}

module.exports = {
  McpServer,
  McpServerManager
};
