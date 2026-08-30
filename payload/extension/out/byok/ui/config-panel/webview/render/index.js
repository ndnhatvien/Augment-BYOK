(function () {
  "use strict";

  const ns = (window.__byokCfgPanel = window.__byokCfgPanel || {});
  const { normalizeStr, uniq, escapeHtml, optionHtml, computeProviderIndexById } = ns;

  const ENDPOINT_GROUPS_V1 = [
    {
      id: "llm_data_plane",
      label: "LLM Data Plane (7)",
      endpoints: [
        /* BEGIN GENERATED: LLM_ENDPOINTS */
        "/get-models",
        "/chat",
        "/completion",
        "/chat-input-completion",
        "/chat-stream",
        "/prompt-enhancer",
        "/generate-commit-message-stream"
        /* END GENERATED: LLM_ENDPOINTS */
      ]
    },
    {
      id: "remote_agents",
      label: "Remote Agents (4)",
      endpoints: [
        "/remote-agents/list",
        "/remote-agents/list-stream",
        "/remote-agents/get-chat-history",
        "/remote-agents/agent-history-stream"
      ]
    },
    {
      id: "agents_tools",
      label: "Agents / Tools (7)",
      endpoints: [
        "/agents/check-tool-safety",
        "/agents/revoke-tool-access",
        "/agents/list-remote-tools",
        "/agents/run-remote-tool",
        "/agents/edit-file",
        "/agents/codebase-retrieval",
        "/agents/codebase-retrieval-raw"
      ]
    },
    {
      id: "blobs_context_sync",
      label: "File / Blob / Context Sync (9)",
      endpoints: [
        "/batch-upload",
        "/checkpoint-blobs",
        "/find-missing",
        "/save-chat",
        "/context-canvas/list",
        "/search-external-sources",
        "/indexed-commits/get-latest-blobset",
        "/indexed-commits/register-blobset",
        "/chat/exchanges/list"
      ]
    },
    {
      id: "cloud_agents_experts",
      label: "Cloud Agents / Experts (3)",
      endpoints: [
        "/cloud-agents/agents/send-message",
        "/cloud-agents/agents/rename",
        "/cloud-experts/experts/create-agent"
      ]
    },
    {
      id: "auth_subscription",
      label: "Account / Subscription / Permissions (5)",
      endpoints: [
        "/token",
        "/get-credit-info",
        "/get-billing-summary",
        "/subscription-banner",
        "/settings/get-tenant-tool-permissions"
      ]
    },
    {
      id: "feedback_telemetry_debug",
      label: "Feedback / Telemetry / Debug (10)",
      endpoints: [
        "/chat-feedback",
        "/client-metrics",
        "/client-completion-timelines",
        "/record-session-events",
        "/record-user-events",
        "/record-request-events",
        "/report-error",
        "/resolve-completions",
        "/resolve-chat-input-completion",
        "/resolve-edit"
      ]
    },
    {
      id: "notifications",
      label: "Notifications (2)",
      endpoints: [
        "/notifications/read",
        "/notifications/mark-as-read"
      ]
    }
  ];

  const ENDPOINT_MEANINGS_V1 = {
    /* BEGIN GENERATED: LLM_ENDPOINT_MEANINGS */
    "/get-models": "Fetch available models / feature flags (and inject into the BYOK models registry)",
    "/chat": "Non-streaming chat (or chat requests in some scenarios)",
    "/completion": "Editor inline completion (short text)",
    "/chat-input-completion": "Chat input box smart completion",
    "/chat-stream": "Core chat stream (Augment NDJSON)",
    "/prompt-enhancer": "Prompt enhancer (stream)",
    "/generate-commit-message-stream": "Commit message (stream)",
    /* END GENERATED: LLM_ENDPOINT_MEANINGS */

    "/remote-agents/list": "List (one-shot)",
    "/remote-agents/list-stream": "List (streaming updates)",
    "/remote-agents/get-chat-history": "Fetch conversation history (one-shot)",
    "/remote-agents/agent-history-stream": "Conversation / event history stream",

    "/agents/check-tool-safety": "Tool safety check / admission",
    "/agents/revoke-tool-access": "Revoke tool permissions",
    "/agents/list-remote-tools": "List available remote tools",
    "/agents/run-remote-tool": "Run a remote tool",
    "/agents/edit-file": "Edit files through an agent",
    "/agents/codebase-retrieval": "Codebase retrieval",
    "/agents/codebase-retrieval-raw": "Codebase retrieval (raw)",

    "/batch-upload": "Batch upload blobs (file content / context)",
    "/checkpoint-blobs": "Checkpoint-related blob operations",
    "/find-missing": "Find missing blobs",
    "/save-chat": "Save session / record (server-side persistence)",
    "/context-canvas/list": "Context Canvas list",
    "/search-external-sources": "Search external sources",
    "/indexed-commits/get-latest-blobset": "Indexed commits latest blobset",
    "/indexed-commits/register-blobset": "Indexed commits register blobset",
    "/chat/exchanges/list": "Chat exchanges list",

    "/cloud-agents/agents/send-message": "Cloud agent send message",
    "/cloud-agents/agents/rename": "Cloud agent rename",
    "/cloud-experts/experts/create-agent": "Cloud expert create agent",

    "/token": "Token retrieval / refresh (auth related)",
    "/get-credit-info": "Credit / credits info",
    "/get-billing-summary": "Billing summary",
    "/subscription-banner": "Subscription banner",
    "/settings/get-tenant-tool-permissions": "Tenant-level tool permission settings",

    "/chat-feedback": "Chat feedback",
    "/client-metrics": "Client metrics",
    "/client-completion-timelines": "Completion timeline (behavior sequence)",
    "/record-session-events": "Session events",
    "/record-user-events": "User events",
    "/record-request-events": "Request event recording",
    "/report-error": "Error reporting",
    "/resolve-completions": "resolve* (logging / attribution)",
    "/resolve-chat-input-completion": "resolve* (logging / attribution)",
    "/resolve-edit": "resolve* (logging / attribution)",

    "/notifications/read": "Fetch notifications",
    "/notifications/mark-as-read": "Mark as read"
  };

  ns.ENDPOINT_GROUPS_V1 = ENDPOINT_GROUPS_V1;
  ns.ENDPOINT_MEANINGS_V1 = ENDPOINT_MEANINGS_V1;

  // Keep namespace shape stable (avoid unused warnings in older bundlers).
  void normalizeStr;
  void uniq;
  void optionHtml;
  void computeProviderIndexById;
})();
