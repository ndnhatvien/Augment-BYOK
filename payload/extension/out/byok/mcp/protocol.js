"use strict";

/**
 * MCP JSON-RPC 2.0 Protocol Handler
 * Spec: https://spec.modelcontextprotocol.io
 */

const { EventEmitter } = require("events");

class McpProtocolError extends Error {
  constructor(code, message, data) {
    super(message);
    this.name = "McpProtocolError";
    this.code = code;
    this.data = data;
  }
}

const ErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SERVER_NOT_INITIALIZED: -32002,
  REQUEST_TIMEOUT: -32001
};

class McpProtocol extends EventEmitter {
  constructor({ timeout = 30000 } = {}) {
    super();
    this.timeout = timeout;
    this.nextId = 1;
    this.pendingRequests = new Map();
    this.buffer = "";
  }

  buildRequest(method, params = {}, id = null) {
    const requestId = id ?? this.nextId++;
    const request = {
      jsonrpc: "2.0",
      id: requestId,
      method,
      params
    };
    return { request, requestId };
  }

  buildNotification(method, params = {}) {
    return {
      jsonrpc: "2.0",
      method,
      params
    };
  }

  buildResponse(id, result) {
    return {
      jsonrpc: "2.0",
      id,
      result
    };
  }

  buildError(id, code, message, data = undefined) {
    return {
      jsonrpc: "2.0",
      id,
      error: { code, message, data }
    };
  }

  async sendRequest(method, params, { timeoutMs } = {}) {
    const { request, requestId } = this.buildRequest(method, params);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new McpProtocolError(
          ErrorCode.REQUEST_TIMEOUT,
          `Request ${method} timed out after ${timeoutMs ?? this.timeout}ms`
        ));
      }, timeoutMs ?? this.timeout);

      this.pendingRequests.set(requestId, {
        resolve: (result) => {
          clearTimeout(timeout);
          this.pendingRequests.delete(requestId);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          this.pendingRequests.delete(requestId);
          reject(error);
        }
      });

      this.emit("send", request);
    });
  }

  sendNotification(method, params) {
    const notification = this.buildNotification(method, params);
    this.emit("send", notification);
  }

  handleIncoming(data) {
    this.buffer += data.toString();
    const lines = this.buffer.split("\n");

    // Keep last incomplete line in buffer
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const message = JSON.parse(trimmed);
        this.processMessage(message);
      } catch (err) {
        this.emit("error", new McpProtocolError(
          ErrorCode.PARSE_ERROR,
          "Failed to parse JSON-RPC message",
          { line: trimmed, error: err.message }
        ));
      }
    }
  }

  processMessage(message) {
    if (!message || typeof message !== "object") {
      this.emit("error", new McpProtocolError(
        ErrorCode.INVALID_REQUEST,
        "Message must be an object"
      ));
      return;
    }

    if (message.jsonrpc !== "2.0") {
      this.emit("error", new McpProtocolError(
        ErrorCode.INVALID_REQUEST,
        "Invalid JSON-RPC version"
      ));
      return;
    }

    // Response
    if ("result" in message || "error" in message) {
      this.handleResponse(message);
      return;
    }

    // Request or notification
    if ("method" in message) {
      if ("id" in message) {
        this.handleRequest(message);
      } else {
        this.handleNotification(message);
      }
      return;
    }

    this.emit("error", new McpProtocolError(
      ErrorCode.INVALID_REQUEST,
      "Invalid JSON-RPC message structure"
    ));
  }

  handleResponse(response) {
    const { id } = response;
    const pending = this.pendingRequests.get(id);

    if (!pending) {
      // Unexpected response, ignore
      return;
    }

    if ("error" in response) {
      const { code, message, data } = response.error;
      pending.reject(new McpProtocolError(code, message, data));
    } else {
      pending.resolve(response.result);
    }
  }

  handleRequest(request) {
    this.emit("request", request);
  }

  handleNotification(notification) {
    this.emit("notification", notification);
  }

  reset() {
    this.buffer = "";
    for (const [id, pending] of this.pendingRequests.entries()) {
      pending.reject(new Error("Protocol reset"));
    }
    this.pendingRequests.clear();
  }
}

module.exports = {
  McpProtocol,
  McpProtocolError,
  ErrorCode
};
