(function () {
  "use strict";

  const ns = (window.__byokCfgPanel = window.__byokCfgPanel || {});
  const { normalizeStr, uniq, escapeHtml, optionHtml, computeProviderIndexById } = ns;

  const ENDPOINT_GROUPS_V1 = [
    {
      id: "llm_data_plane",
      label: "LLM Data Plane (11)",
      endpoints: [
        /* BEGIN GENERATED: LLM_ENDPOINTS */
        "/get-models",
        "/chat",
        "/completion",
        "/chat-input-completion",
        "/next_edit_loc",
        "/chat-stream",
        "/prompt-enhancer",
        "/instruction-stream",
        "/smart-paste-stream",
        "/next-edit-stream",
        "/generate-commit-message-stream"
        /* END GENERATED: LLM_ENDPOINTS */
      ]
    },
    {
      id: "remote_agents",
      label: "Remote Agents (15)",
      endpoints: [
        "/remote-agents/create",
        "/remote-agents/update",
        "/remote-agents/delete",
        "/remote-agents/list",
        "/remote-agents/list-stream",
        "/remote-agents/chat",
        "/remote-agents/get-chat-history",
        "/remote-agents/agent-history-stream",
        "/remote-agents/logs",
        "/remote-agents/interrupt",
        "/remote-agents/pause",
        "/remote-agents/resume",
        "/remote-agents/resume-hint",
        "/remote-agents/generate-summary",
        "/remote-agents/add-ssh-key"
      ]
    },
    {
      id: "agents_tools",
      label: "Agents / Tools (6)",
      endpoints: [
        "/agents/check-tool-safety",
        "/agents/revoke-tool-access",
        "/agents/list-remote-tools",
        "/agents/run-remote-tool",
        "/agents/edit-file",
        "/agents/codebase-retrieval"
      ]
    },
    {
      id: "blobs_context_sync",
      label: "Files/Blob/Context Sync (7)",
      endpoints: [
        "/batch-upload",
        "/checkpoint-blobs",
        "/find-missing",
        "/save-chat",
        "/context-canvas/list",
        "/get-implicit-external-sources",
        "/search-external-sources"
      ]
    },
    {
      id: "github",
      label: "GitHub Integration (4)",
      endpoints: [
        "/github/is-user-configured",
        "/github/list-repos",
        "/github/list-branches",
        "/github/get-repo"
      ]
    },
    {
      id: "auth_subscription_secrets",
      label: "Account/Subscription/Permissions/Secrets (7)",
      endpoints: [
        "/token",
        "/get-credit-info",
        "/subscription-banner",
        "/settings/get-tenant-tool-permissions",
        "/user-secrets/list",
        "/user-secrets/upsert",
        "/user-secrets/delete"
      ]
    },
    {
      id: "feedback_telemetry_debug",
      label: "Feedback/Telemetry/Debug (17)",
      endpoints: [
        "/chat-feedback",
        "/completion-feedback",
        "/next-edit-feedback",
        "/client-metrics",
        "/client-completion-timelines",
        "/record-session-events",
        "/record-user-events",
        "/record-preference-sample",
        "/record-request-events",
        "/report-error",
        "/report-feature-vector",
        "/resolve-completions",
        "/resolve-chat-input-completion",
        "/resolve-edit",
        "/resolve-instruction",
        "/resolve-next-edit",
        "/resolve-smart-paste"
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
    "/get-models": "Fetch available models/feature flags (and inject BYOK models registry)",
    "/chat": "Non-streaming chat (or chat in some scenarios)",
    "/completion": "Editor inline completion (short text)",
    "/chat-input-completion": "Smart completion in chat input box",
    "/next_edit_loc": "Next Edit location (candidate positions JSON)",
    "/chat-stream": "Core chat stream (Augment NDJSON)",
    "/prompt-enhancer": "Prompt enhancer (stream)",
    "/instruction-stream": "Instruction generation/rewrite (stream)",
    "/smart-paste-stream": "Smart Paste (stream)",
    "/next-edit-stream": "Next Edit suggestions (stream)",
    "/generate-commit-message-stream": "Commit message (stream)",
    /* END GENERATED: LLM_ENDPOINT_MEANINGS */

    "/remote-agents/create": "Create remote agent",
    "/remote-agents/update": "Update configuration",
    "/remote-agents/delete": "Delete",
    "/remote-agents/list": "List (one-shot)",
    "/remote-agents/list-stream": "List (stream updates)",
    "/remote-agents/chat": "Chat with remote agent / assign tasks",
    "/remote-agents/get-chat-history": "Fetch chat history (one-shot)",
    "/remote-agents/agent-history-stream": "Chat/event history stream",
    "/remote-agents/logs": "Logs",
    "/remote-agents/interrupt": "Interrupt execution",
    "/remote-agents/pause": "Pause",
    "/remote-agents/resume": "Resume",
    "/remote-agents/resume-hint": "Resume hints / state sync",
    "/remote-agents/generate-summary": "Generate summary",
    "/remote-agents/add-ssh-key": "Write SSH key",

    "/agents/check-tool-safety": "Tool safety check / admission",
    "/agents/revoke-tool-access": "Revoke tool access",
    "/agents/list-remote-tools": "List available remote tools",
    "/agents/run-remote-tool": "Run remote tool",
    "/agents/edit-file": "Edit files via agent",
    "/agents/codebase-retrieval": "Codebase retrieval",

    "/batch-upload": "Batch upload blobs (file content/context)",
    "/checkpoint-blobs": "Checkpoint-related blob operations",
    "/find-missing": "Find missing blobs",
    "/save-chat": "Save chat/session records (server persistence)",
    "/context-canvas/list": "Context Canvas list",
    "/get-implicit-external-sources": "Implicit external sources",
    "/search-external-sources": "External source search",

    "/github/is-user-configured": "Whether GitHub is configured",
    "/github/list-repos": "Repository list",
    "/github/list-branches": "Branch list",
    "/github/get-repo": "Get specified repo info/metadata",

    "/token": "Token fetch/refresh (auth related)",
    "/get-credit-info": "Quota/credits information",
    "/subscription-banner": "Subscription prompt banner",
    "/settings/get-tenant-tool-permissions": "Tenant-level tool permission settings",
    "/user-secrets/list": "List user secrets",
    "/user-secrets/upsert": "Create/update secrets",
    "/user-secrets/delete": "Delete secrets",

    "/chat-feedback": "Chat feedback",
    "/completion-feedback": "Completion feedback",
    "/next-edit-feedback": "Next Edit feedback",
    "/client-metrics": "Client metrics",
    "/client-completion-timelines": "Completion timeline (event sequence)",
    "/record-session-events": "Session events",
    "/record-user-events": "User events",
    "/record-preference-sample": "Preference samples (for training/evaluation)",
    "/record-request-events": "Request event logs",
    "/report-error": "Error reporting",
    "/report-feature-vector": "Feature vector reporting",
    "/resolve-completions": "resolve* (logs/attribution)",
    "/resolve-chat-input-completion": "resolve* (logs/attribution)",
    "/resolve-edit": "resolve* (logs/attribution)",
    "/resolve-instruction": "resolve* (logs/attribution)",
    "/resolve-next-edit": "resolve* (logs/attribution)",
    "/resolve-smart-paste": "resolve* (logs/attribution)",

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
