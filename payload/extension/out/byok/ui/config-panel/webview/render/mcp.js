(function () {
  "use strict";

  const ns = (window.__byokCfgPanel = window.__byokCfgPanel || {});
  const { normalizeStr, escapeHtml } = ns;

  function jsonForServers(servers) {
    try {
      return JSON.stringify(Array.isArray(servers) ? servers : [], null, 2);
    } catch {
      return "";
    }
  }

  ns.renderContextInjectionPanel = function renderContextInjectionPanel({ cfg } = {}) {
    const c = cfg && typeof cfg === "object" ? cfg : {};
    const off = c.official && typeof c.official === "object" ? c.official : {};
    const mcp = c.mcp && typeof c.mcp === "object" ? c.mcp : {};

    const contextInjectionDisabled = off.disableContextInjection === true;
    const localAceEnabled = off.localAceEnabled === true;
    const mcpEnabled = mcp.enabled === true;
    const mcpPrimary = contextInjectionDisabled && mcpEnabled;
    const aceCceUrl = normalizeStr(off.aceCceUrl ?? "");
    const injectPosition = normalizeStr(mcp.injectPosition);
    const positionSelected = injectPosition === "before" || injectPosition === "after" || injectPosition === "replace" ? injectPosition : "before";

    const contextBadge = contextInjectionDisabled
      ? `<span class="status-badge status-badge--warning">official context: off</span>`
      : `<span class="status-badge status-badge--success">official context: on</span>`;
    const localAceBadge = localAceEnabled
      ? `<span class="status-badge status-badge--success">local-ace: on</span>`
      : `<span class="status-badge status-badge--warning">local-ace: off</span>`;
    const mcpBadge = mcpEnabled
      ? `<span class="status-badge status-badge--success">mcp: on</span>`
      : `<span class="status-badge status-badge--warning">mcp: off</span>`;
    const mcpPrimaryBadge = mcpPrimary ? `<span class="status-badge status-badge--success">primary context</span>` : "";

    return `
      <section class="settings-panel">
        <header class="settings-panel__header">
          <span>Context Injection</span>
          ${contextBadge}
          ${localAceBadge}
          ${mcpBadge}
          ${mcpPrimaryBadge}
        </header>
        <div class="settings-panel__body">
          <div class="form-grid">
            <div class="form-group form-grid--full">
              <label class="form-label flex-row" style="gap:8px;align-items:center;">
                <input type="checkbox" id="officialDisableContextInjection" ${contextInjectionDisabled ? "checked" : ""} />
                <span>Disable automatic Context Engine injection</span>
              </label>
              <div class="text-muted text-xs">When on, chat no longer requests <span class="text-mono">agents/codebase-retrieval</span> / <span class="text-mono">context-canvas</span> / <span class="text-mono">search-external-sources</span> automatically. The token can still be used for <span class="text-mono">/get-models</span>; MCP below becomes the active context source.</div>
            </div>
            <div class="form-group form-grid--full">
              <label class="form-label flex-row" style="gap:8px;align-items:center;">
                <input type="checkbox" id="officialLocalAceEnabled" ${localAceEnabled ? "checked" : ""} />
                <span>Use local Code Context Engine (CCE) for codebase-retrieval</span>
              </label>
              <div class="text-muted text-xs">When on, <span class="text-mono">agents/codebase-retrieval</span> is answered by a local CCE server instead of the official ACE endpoint; no <span class="text-mono">apiToken</span> is required and injection runs even without blobs. Requires <span class="text-mono">cce serve --http</span> to be running.</div>
            </div>
            <div class="form-group form-grid--full">
              <label class="form-label" for="officialAceCceUrl">CCE URL</label>
              <input type="url" id="officialAceCceUrl" value="${escapeHtml(aceCceUrl)}" placeholder="http://127.0.0.1:8765" />
              <div class="text-muted text-xs">Base URL of the local CCE server; empty defaults to <span class="text-mono">http://127.0.0.1:8765</span>.</div>
            </div>
            <div class="form-group form-grid--full">
              <div class="form-group-divider"></div>
            </div>
            <div class="form-group">
              <label class="form-label">MCP</label>
              <label class="checkbox-wrapper"><input type="checkbox" id="mcpEnabled" ${mcpEnabled ? "checked" : ""} /><span>Enabled</span></label>
              <div class="text-muted text-xs">Pull context from the configured MCP servers (stdio) and inject it as an extra context node${contextInjectionDisabled ? " — this is the active context source while official injection is disabled" : ""}.</div>
            </div>
            <div class="form-group">
              <label class="form-label" for="mcpInjectPosition">Inject Position</label>
              <select id="mcpInjectPosition">
                ${["before", "after", "replace"]
                  .map(
                    (v) =>
                      `<option value="${v}"${v === positionSelected ? " selected" : ""}>${v === "replace" ? "replace official context" : v === "after" ? "after official context" : "before official context"}</option>`
                  )
                  .join("")}
              </select>
              <div class="text-muted text-xs">before: insert MCP node ahead of the official codebase-retrieval node; after: append after it; replace: drop official retrieval nodes and only keep the MCP node.</div>
            </div>
            <div class="form-group form-grid--full">
              <label class="form-label" for="mcpServersJson">Servers (JSON array)</label>
              <textarea class="mono" id="mcpServersJson" rows="10" placeholder='[{"name":"filesystem","command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","/tmp"],"env":{"OPENAI_API_KEY":"..."}}]'>${escapeHtml(
                jsonForServers(mcp.servers)
              )}</textarea>
              <div class="text-muted text-xs">Each server: <span class="text-mono">name</span> (unique id), <span class="text-mono">command</span> + <span class="text-mono">args</span> to spawn, optional <span class="text-mono">env</span> (merged over the process env). Invalid entries are dropped on save; env values are redacted when exporting without secrets.</div>
            </div>
          </div>
        </div>
      </section>
    `;
  };
})();
