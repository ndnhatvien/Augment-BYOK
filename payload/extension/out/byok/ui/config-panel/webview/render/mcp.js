(function () {
  "use strict";

  const ns = (window.__byokCfgPanel = window.__byokCfgPanel || {});
  const { normalizeStr, escapeHtml, hasVisibleSecretValue } = ns;

  function jsonForServers(servers) {
    try {
      return JSON.stringify(Array.isArray(servers) ? servers : [], null, 2);
    } catch {
      return "";
    }
  }

  ns.renderOfficialAndContextPanel = function renderOfficialAndContextPanel({ cfg, officialTest } = {}) {
    const c = cfg && typeof cfg === "object" ? cfg : {};
    const off = c.official && typeof c.official === "object" ? c.official : {};
    const mcp = c.mcp && typeof c.mcp === "object" ? c.mcp : {};

    const completionUrl = normalizeStr(off.completionUrl ?? "");
    const completionUrlValid = !completionUrl || /^https?:\/\//i.test(completionUrl);
    const completionUrlBadge = completionUrlValid
      ? `<span class="status-badge status-badge--success">url: ok</span>`
      : `<span class="status-badge status-badge--error">url: invalid</span>`;
    const tokenSet = typeof hasVisibleSecretValue === "function" ? hasVisibleSecretValue(off.apiToken) : Boolean(normalizeStr(off.apiToken));
    const tokenBadge = tokenSet
      ? `<span class="status-badge status-badge--success">token: set</span>`
      : `<span class="status-badge status-badge--warning">token: empty</span>`;

    const contextInjectionDisabled = off.disableContextInjection === true;
    const localAceEnabled = off.localAceEnabled === true;
    const mcpEnabled = mcp.enabled === true;
    const mcpPrimary = contextInjectionDisabled && mcpEnabled;
    const aceCceUrl = normalizeStr(off.aceCceUrl ?? "");
    const injectPosition = normalizeStr(mcp.injectPosition);
    const positionSelected = injectPosition === "before" || injectPosition === "after" || injectPosition === "replace" ? injectPosition : "before";

    const contextBadge = contextInjectionDisabled
      ? `<span class="status-badge status-badge--warning">context: off</span>`
      : `<span class="status-badge status-badge--success">context: on</span>`;
    const localAceBadge = localAceEnabled
      ? `<span class="status-badge status-badge--success">cce: on</span>`
      : `<span class="status-badge status-badge--warning">cce: off</span>`;
    const mcpBadge = mcpEnabled
      ? `<span class="status-badge status-badge--success">mcp: on</span>`
      : `<span class="status-badge status-badge--warning">mcp: off</span>`;
    const mcpPrimaryBadge = mcpPrimary ? `<span class="status-badge status-badge--success">primary: mcp</span>` : "";

    const officialGithubLink =
      typeof ns.renderGithubLink === "function"
        ? ns.renderGithubLink("https://github.com/ndnhatvien/Awesome-Context-Engineering", "ndnhatvien/Awesome-Context-Engineering on GitHub")
        : "";
    const cceGithubLink =
      typeof ns.renderGithubLink === "function"
        ? ns.renderGithubLink("https://github.com/elara-labs/code-context-engine", "elara-labs/code-context-engine on GitHub")
        : "";

    const ot = officialTest && typeof officialTest === "object" ? officialTest : {};
    const otRunning = ot.running === true;
    const otOk = ot.ok === true ? true : ot.ok === false ? false : null;
    const otText = normalizeStr(ot.text);
    const otTextShort = otText.length > 80 ? otText.slice(0, 80) + "…" : otText;
    const otBadge = otRunning
      ? `<span class="status-badge status-badge--warning">testing</span>`
      : otOk === true
        ? `<span class="status-badge status-badge--success">all pass</span>`
        : otOk === false
          ? `<span class="status-badge status-badge--error">failed</span>`
          : "";
    const otTextHtml = otTextShort
      ? `<span class="text-muted text-mono text-xs inline-ellipsis"${otText !== otTextShort ? ` title="${escapeHtml(otText)}"` : ""}>${escapeHtml(otTextShort)}</span>`
      : "";

    const results = Array.isArray(ot.results) ? ot.results : [];
    const testResultsHtml =
      results.length > 0
        ? `
      <div class="form-group form-grid--full" style="margin-top:4px;">
        <div style="background:var(--vscode-editor-inactiveSelectionBackground, rgba(128,128,128,0.1));padding:10px 14px;border-radius:4px;border:1px solid var(--color-border);">
          <div class="flex-row flex-between" style="font-weight:600;font-size:0.85em;margin-bottom:8px;">
            <span>Awesome-Context-Engineering Endpoint Test</span>
            <span class="text-muted text-xs text-mono">${escapeHtml(otText || "")}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;">
            ${results
              .map(
                (r) => `
              <div class="flex-row flex-between" style="font-size:0.85em;padding:3px 0;border-bottom:1px dashed var(--vscode-editorWidget-border, rgba(128,128,128,0.2));">
                <div class="flex-row" style="gap:8px;">
                  <span class="status-badge ${r.ok ? "status-badge--success" : "status-badge--error"}">${r.ok ? "PASS" : "FAIL"}</span>
                  <span class="text-mono" style="font-weight:500;">${escapeHtml(r.endpoint)}</span>
                </div>
                <div class="flex-row" style="gap:8px;">
                  <span class="text-muted text-xs">${escapeHtml(r.detail)}</span>
                  <span class="text-muted text-xs text-mono" style="opacity:0.8;">${Number(r.elapsedMs) || 0}ms</span>
                </div>
              </div>
            `
              )
              .join("")}
          </div>
        </div>
      </div>
    `
        : "";

    return `
      <section class="settings-panel">
        <header class="settings-panel__header">
          <div class="flex-row flex-wrap" style="align-items:center;">
            <span class="flex-row" style="gap:6px;align-items:center;font-weight:600;">
              <span>Official & Context Engine</span>
              ${officialGithubLink}
            </span>
            ${completionUrlBadge}
            ${tokenBadge}
            ${contextBadge}
            ${localAceBadge}
            ${mcpBadge}
            ${mcpPrimaryBadge}
          </div>
          <div class="flex-row flex-wrap" style="min-width:0;align-items:center;">
            <button class="btn btn--small btn--primary" data-action="testOfficialEndpoints" ${otRunning ? "disabled" : ""} title="Test official endpoints (/get-models, /agents/codebase-retrieval, /context-canvas/list, /search-external-sources)">Test Endpoints</button>
            ${otBadge}
            ${otTextHtml}
          </div>
        </header>
        <div class="settings-panel__body">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label" for="officialCompletionUrl">Completion URL</label>
              <input type="url" id="officialCompletionUrl" value="${escapeHtml(off.completionUrl ?? "")}" placeholder="https://acemcp.heroman.wtf/relay/" />
              <div class="text-muted text-xs">Used for <span class="text-mono">/get-models</span> merging and official path requests (see <a class="text-link" href="https://github.com/ndnhatvien/Awesome-Context-Engineering" target="_blank" rel="noreferrer noopener" onclick="event.stopPropagation()">ndnhatvien/Awesome-Context-Engineering</a>).</div>
            </div>
            <div class="form-group">
              <div class="flex-between flex-row">
                <label class="form-label" for="officialApiToken">API Token</label>
                ${tokenBadge}
              </div>
              <div class="flex-row">
                <input type="password" id="officialApiToken" value="" placeholder="${off.apiToken ? "(set)" : "(empty)"}" />
                <button class="btn btn--icon btn--danger" data-action="clearOfficialToken" title="Clear token">✕</button>
              </div>
              <div class="text-muted text-xs">Configure via <a class="text-link" href="https://github.com/ndnhatvien/Awesome-Context-Engineering" target="_blank" rel="noreferrer noopener" onclick="event.stopPropagation()">ndnhatvien/Awesome-Context-Engineering</a>. Leave empty = no change; click ✕ = clear (applies after save).</div>
            </div>

            ${testResultsHtml}

            <div class="form-group form-grid--full">
              <div class="form-group-divider"></div>
            </div>

            <div class="form-group form-grid--full">
              <label class="form-label flex-row" style="gap:8px;align-items:center;">
                <input type="checkbox" id="officialDisableContextInjection" ${contextInjectionDisabled ? "checked" : ""} />
                <span>Disable automatic Context Engine injection</span>
              </label>
              <div class="text-muted text-xs">When on, chat no longer requests <span class="text-mono">agents/codebase-retrieval</span> / <span class="text-mono">context-canvas</span> / <span class="text-mono">search-external-sources</span> automatically. The token can still be used for <span class="text-mono">/get-models</span>; MCP below becomes the active context source.</div>
            </div>
            <div class="form-group form-grid--full">
              <div class="flex-row" style="gap:8px;align-items:center;">
                <label class="form-label flex-row" style="gap:8px;align-items:center;cursor:pointer;margin-bottom:0;">
                  <input type="checkbox" id="officialLocalAceEnabled" ${localAceEnabled ? "checked" : ""} />
                  <span>Use local Code Context Engine (CCE) for codebase-retrieval</span>
                </label>
                ${cceGithubLink}
              </div>
              <div class="text-muted text-xs">When on, <span class="text-mono">agents/codebase-retrieval</span> is answered by a local CCE server instead of the official ACE endpoint; no <span class="text-mono">apiToken</span> is required and injection runs even without blobs. Requires <a class="text-link" href="https://github.com/elara-labs/code-context-engine" target="_blank" rel="noreferrer noopener" onclick="event.stopPropagation()">elara-labs/code-context-engine</a> (<span class="text-mono">cce serve --http</span>) to be running.</div>
            </div>
            <div class="form-group form-grid--full">
              <div class="flex-row" style="gap:8px;align-items:center;">
                <label class="form-label" for="officialAceCceUrl" style="margin-bottom:0;">CCE URL</label>
                ${cceGithubLink}
              </div>
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
              <div class="text-muted text-xs">before: insert MCP node ahead of official retrieval; after: append after it; replace: drop official retrieval nodes and only keep the MCP node.</div>
            </div>
            <div class="form-group form-grid--full">
              <label class="form-label" for="mcpServersJson">Servers (JSON array)</label>
              <textarea class="mono" id="mcpServersJson" rows="8" placeholder='[{"name":"filesystem","command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","/tmp"],"env":{"OPENAI_API_KEY":"..."}}]'>${escapeHtml(
                jsonForServers(mcp.servers)
              )}</textarea>
              <div class="text-muted text-xs">Each server: <span class="text-mono">name</span> (unique id), <span class="text-mono">command</span> + <span class="text-mono">args</span> to spawn, optional <span class="text-mono">env</span> (merged over the process env). Invalid entries are dropped on save; env values are redacted when exporting without secrets.</div>
            </div>
          </div>
        </div>
      </section>
    `;
  };

  ns.renderContextInjectionPanel = ns.renderOfficialAndContextPanel;
})();
