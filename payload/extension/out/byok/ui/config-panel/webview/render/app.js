(function () {
  "use strict";

  const ns = (window.__byokCfgPanel = window.__byokCfgPanel || {});
  const { normalizeStr, uniq, escapeHtml } = ns;

  function computeOfficialTestUi(officialTest) {
    const ot = officialTest && typeof officialTest === "object" ? officialTest : {};
    const running = ot.running === true;
    const ok = ot.ok === true ? true : ot.ok === false ? false : null;
    const text = normalizeStr(ot.text);
    const textShort = text.length > 140 ? text.slice(0, 140) + "…" : text;
    const badgeHtml = running
      ? `<span class="status-badge status-badge--warning">testing</span>`
      : ok === true
        ? `<span class="status-badge status-badge--success">ok</span>`
        : ok === false
          ? `<span class="status-badge status-badge--error">failed</span>`
          : "";
    const textHtml = textShort
      ? `<span class="text-muted text-mono text-xs inline-ellipsis"${text !== textShort ? ` title="${escapeHtml(text)}"` : ""}>${escapeHtml(textShort)}</span>`
      : "";
    return { running, ok, text, textShort, badgeHtml, textHtml };
  }

  function summarizeSelfTestReportHtml(stReport) {
    if (!stReport) return "";
    const ps = Array.isArray(stReport.providers) ? stReport.providers : [];
    const total = ps.length;
    const failed = ps.filter((p) => p && p.ok === false).length;
    const globals = stReport.global && typeof stReport.global === "object" ? stReport.global : {};
    const gTests = Array.isArray(globals.tests) ? globals.tests : [];
    const gFailed = gTests.filter((x) => x && x.ok === false).length;
    const captured = globals.capturedTools && typeof globals.capturedTools === "object" ? globals.capturedTools : null;
    const capturedCount = Number.isFinite(Number(captured?.count)) ? Number(captured.count) : 0;
    const capturedSource = normalizeStr(captured?.source);
    const toolExec = globals.toolExec && typeof globals.toolExec === "object" ? globals.toolExec : null;
    const toolExecBadge =
      toolExec && toolExec.ok === true ? `<span class="badge">ok</span>` : toolExec && toolExec.ok === false ? `<span class="badge">failed</span>` : "";
    const failedTools = toolExec && Array.isArray(toolExec.failedTools) ? toolExec.failedTools : [];
    const failedToolsText = failedTools.length ? `${failedTools.join(",")}${toolExec && toolExec.failedToolsTruncated ? ",…" : ""}` : "";
    const badge = stReport.ok === true ? `<span class="badge">ok</span>` : `<span class="badge">failed</span>`;
    return (
      `<div class="small">result: ${badge} providers_failed=${failed}/${total} global_failed=${gFailed}/${gTests.length}</div>` +
      `<div class="small">captured_tools: <span class="badge">${capturedCount}</span>${capturedSource ? ` <span class="text-muted text-xs">(${escapeHtml(capturedSource)})</span>` : ""}</div>` +
      (toolExec ? `<div class="small">toolsExec: ${toolExecBadge} ${escapeHtml(String(toolExec.detail || ""))}</div>` : "") +
      (failedToolsText ? `<div class="small mono">failed_tools: ${escapeHtml(failedToolsText)}</div>` : "")
    );
  }

  ns.renderApp = function renderApp({
    cfg,
    runtimeEnabled,
    status,
    modal,
    dirty,
    endpointSearch,
    selfTest,
    selfTestProviderKeys,
    officialTest,
    providerExpanded
  }) {
    const c = cfg && typeof cfg === "object" ? cfg : {};
    const off = c.official && typeof c.official === "object" ? c.official : {};
    const endpointSearchText = normalizeStr(endpointSearch);

    const st = selfTest && typeof selfTest === "object" ? selfTest : {};
    const stRunning = st.running === true;
    const stLogs = Array.isArray(st.logs) ? st.logs : [];
    const stReport = st.report && typeof st.report === "object" ? st.report : null;

    const providers = Array.isArray(c.providers) ? c.providers : [];
    const providerKeyByIndex = (p, idx) => normalizeStr(p?.id) || `idx:${idx}`;
    const stProviderKeysRaw = Array.isArray(selfTestProviderKeys) ? selfTestProviderKeys : [];
    const stProviderKeysConfigured = uniq(stProviderKeysRaw.map((k) => normalizeStr(k)).filter(Boolean));
    const availableProviderKeys = providers.map((p, idx) => providerKeyByIndex(p, idx)).filter(Boolean);
    const availableProviderKeySet = new Set(availableProviderKeys);
    const stProviderKeys = stProviderKeysConfigured.filter((k) => availableProviderKeySet.has(k));
    const stProviderKeySet = new Set(stProviderKeys);
    const selfTestProvidersHtml = providers.length
      ? providers
          .map((p, idx) => {
            const pid = normalizeStr(p?.id);
            const type = normalizeStr(p?.type);
            const pKey = providerKeyByIndex(p, idx);
            const title = pid || `provider_${idx + 1}`;
            const checked = stProviderKeySet.has(pKey);
            const disabled = stRunning ? "disabled" : "";
            return `
              <label class="selftest-provider-item${checked ? " is-checked" : ""}" title="${escapeHtml(type || pKey)}">
                <input class="selftest-provider-checkbox" type="checkbox" data-selftest-provider-key="${escapeHtml(pKey)}" ${checked ? "checked" : ""} ${disabled} />
                <span class="selftest-provider-checkbox-ui" aria-hidden="true"></span>
                <span class="selftest-provider-label">
                  <span class="text-mono">${escapeHtml(title)}</span>
                  ${type ? `<span class="text-muted text-xs">(${escapeHtml(type)})</span>` : ""}
                </span>
              </label>
            `;
          })
          .join("")
      : `<div class="text-muted text-xs">(no providers configured)</div>`;

    const isDirty = dirty === true;
    const runtimeEnabledFlag = runtimeEnabled === true;

    const otUi = computeOfficialTestUi(officialTest);
    const otRunning = otUi.running;
    const otBadge = otUi.badgeHtml;
    const otTextHtml = otUi.textHtml;

    const summarizeSelfTestReport = () => summarizeSelfTestReportHtml(stReport);

    const selfTestHtml = `
	      <section class="settings-panel">
	        <header class="settings-panel__header">
	          <div class="flex-row flex-wrap">
	            <span>Self Test</span>
	            ${stRunning ? `<span class="status-badge status-badge--warning">running</span>` : stReport ? (stReport.ok === true ? `<span class="status-badge status-badge--success">ok</span>` : `<span class="status-badge status-badge--error">failed</span>`) : ""}
	          </div>
	          <div class="flex-row flex-wrap">
	            <button class="btn btn--small btn--primary" data-action="runSelfTest" ${stRunning ? "disabled" : ""}>Run</button>
	            <button class="btn btn--small" data-action="cancelSelfTest" ${stRunning ? "" : "disabled"}>Cancel</button>
	            <button class="btn btn--small" data-action="clearSelfTest" ${stRunning ? "disabled" : ""}>Clear</button>
	          </div>
	        </header>
	        <div class="settings-panel__body">
	          <div class="text-muted text-xs">Coverage: models / non-stream / stream / chat-stream / real toolset (schema+tool_use round-trip) / real tool execution (toolsModel.callTool full coverage) / multimodal / context compression (historySummary) / cache hit.</div>
	          <div class="selftest-grid">
	            <div class="selftest-controls">
	              <div class="form-group">
	                <label class="form-label">Providers (multi-select)</label>
	                <div class="selftest-provider-list" role="group" aria-label="Self Test Providers">${selfTestProvidersHtml}</div>
	                <div class="text-muted text-xs">Hint: none selected = all.</div>
	              </div>
	              <div class="flex-row flex-wrap row tight">
	                <button class="btn btn--small" data-action="selfTestSelectAllProviders" ${stRunning || !providers.length ? "disabled" : ""}>Select All</button>
	                <button class="btn btn--small" data-action="selfTestClearSelectedProviders" ${stRunning ? "disabled" : ""}>Clear</button>
	                <span class="text-muted text-xs">${escapeHtml(stProviderKeys.length ? `selected=${stProviderKeys.length}` : `selected=all (${providers.length})`)}</span>
	              </div>
	              ${summarizeSelfTestReport()}
	            </div>
	            <div class="selftest-log">
	              <label class="form-label">Logs</label>
	              <textarea class="mono" id="selfTestLog" readonly>${escapeHtml(stLogs.join("\n"))}</textarea>
	            </div>
	          </div>
	        </div>
	      </section>
	    `;

    const headerBadges = [
      `<span class="status-badge">schema v1</span>`,
      runtimeEnabledFlag ? `<span class="status-badge status-badge--success">BYOK: ON</span>` : `<span class="status-badge status-badge--warning">BYOK: OFF</span>`,
      `<span class="status-badge${isDirty ? " status-badge--warning" : " status-badge--success"}" id="dirtyBadge">${isDirty ? "pending" : "saved"}</span>`
    ].join("");

    const appHeader = `
	      <header class="app-header">
	        <div class="app-title">
	          <h1>
	            Augment BYOK
	            ${headerBadges}
	          </h1>
	          <div class="text-muted text-xs" id="status">${escapeHtml(status || "Ready.")}</div>
	          <div class="text-muted text-xs">Hint: effective after Save; Reload discards unsaved changes.</div>
	        </div>
	        <div class="header-actions flex-row flex-wrap">
	          <label class="checkbox-wrapper" title="Enable or disable BYOK runtime (disable = rollback to official)">
	            <input type="checkbox" id="runtimeEnabledToggle" ${runtimeEnabledFlag ? "checked" : ""} />
	            <span>Enable BYOK</span>
	          </label>
	          <button class="btn btn--small" data-action="importConfig" title="Import config from JSON file (overwrites current config)">Import</button>
	          <button class="btn btn--small" data-action="exportConfig" title="Export current config to JSON file (can include or redact secrets)">Export</button>
	          <button class="btn btn--small" data-action="reload" title="Reload config (discard unsaved changes)">Reload</button>
	          <button class="btn btn--small btn--primary" data-action="save" title="Save config to extension storage">Save</button>
	          <button class="btn btn--small" data-action="reset" title="Reset to default config (clears stored token/key)">Reset</button>
	          <button class="btn btn--small" data-action="reloadWindow" title="Reload VS Code window (reloads extension and main panel)">Reload Window</button>
	        </div>
	      </header>
	    `;

    const completionUrl = normalizeStr(off.completionUrl ?? "");
    const completionUrlValid = !completionUrl || /^https?:\/\//i.test(completionUrl);
    const completionUrlBadge = completionUrlValid
      ? `<span class="status-badge status-badge--success">url: ok</span>`
      : `<span class="status-badge status-badge--error">url: invalid</span>`;
    const tokenSet = Boolean(normalizeStr(off.apiToken));
    const tokenBadge = tokenSet
      ? `<span class="status-badge status-badge--success">token: set</span>`
      : `<span class="status-badge status-badge--warning">token: empty (optional)</span>`;
    const officialAssemblerBadge = `<span class="status-badge status-badge--success">assembler: official</span>`;

    const official = `
	      <section class="settings-panel">
		        <header class="settings-panel__header">
		          <div class="flex-row flex-wrap">
		            <span>Official</span>
		            ${completionUrlBadge}
		            ${tokenBadge}
		            ${officialAssemblerBadge}
		          </div>
	          <div class="flex-row" style="min-width:0;">
	            <button class="btn btn--small" data-action="testOfficialGetModels" ${otRunning ? "disabled" : ""} title="/get-models">Test Connection</button>
	            ${otBadge}
	            ${otTextHtml}
	          </div>
	        </header>
	        <div class="settings-panel__body">
	          <div class="form-grid">
	            <div class="form-group">
	              <label class="form-label" for="officialCompletionUrl">Completion URL</label>
	              <input type="url" id="officialCompletionUrl" value="${escapeHtml(off.completionUrl ?? "")}" placeholder="https://ace.cctv.mba/" />
	              <div class="text-muted text-xs">Default is official; fill your domain for private tenant. Used for official context injection + <span class="text-mono">/get-models</span> merge.</div>
	            </div>
		            <div class="form-group">
		              <div class="flex-between flex-row">
		                <label class="form-label" for="officialApiToken">API Token</label>
		                ${tokenBadge}
		              </div>
	              <div class="flex-row">
	                <input type="password" id="officialApiToken" value="" placeholder="${off.apiToken ? "(set)" : "(empty)"}" />
	                <button class="btn btn--icon btn--danger" data-action="clearOfficialToken" title="Clear Token">✕</button>
		              </div>
		              <div class="text-muted text-xs">Optional: set for private tenant / official injection cases. Empty = keep unchanged; click ✕ = clear (effective after Save).</div>
		            </div>
		          </div>
		        </div>
		      </section>
		    `;

    const providersHtml =
      typeof ns.renderProvidersPanel === "function"
        ? ns.renderProvidersPanel({ providers, providerExpanded })
        : `<div class="text-muted text-xs">providers renderer missing</div>`;

    const historySummaryHtml =
      typeof ns.renderHistorySummaryPanel === "function"
        ? ns.renderHistorySummaryPanel({ cfg: c, providers })
        : `<div class="text-muted text-xs">historySummary renderer missing</div>`;

    const endpointRules =
      typeof ns.renderEndpointRulesPanel === "function"
        ? ns.renderEndpointRulesPanel({ cfg: c, endpointSearchText })
        : `<div class="text-muted text-xs">endpoint rules renderer missing</div>`;

    const m = modal && typeof modal === "object" ? modal : null;
    const mKind = normalizeStr(m?.kind);
    const mIdx = Number(m?.idx);
    const mProvider = Number.isFinite(mIdx) && mIdx >= 0 && mIdx < providers.length ? providers[mIdx] : null;
    const modalHtml =
      !mKind
        ? ""
        : mKind === "confirmReset"
          ? `
              <div class="modal-backdrop">
                <div class="modal card">
                  <div class="title">Reset to defaults?</div>
                  <div class="hint">This will overwrite the BYOK config stored in extension globalState (token/key will also be cleared).</div>
                  <div class="row" style="margin-top:10px;justify-content:flex-end;">
                    <button class="btn" data-action="modalCancel">Cancel</button>
                    <button class="btn danger" data-action="confirmReset">Reset</button>
                  </div>
                </div>
              </div>
            `
          : !mProvider
            ? ""
            : (() => {
                const title =
                  mKind === "models"
                    ? `Edit models (Provider #${mIdx + 1})`
                    : mKind === "headers"
                      ? `Edit headers (Provider #${mIdx + 1})`
                      : `Edit request_defaults (Provider #${mIdx + 1})`;
                const text =
                  mKind === "models"
                    ? (Array.isArray(mProvider.models) ? mProvider.models : []).join("\n")
                    : JSON.stringify(mKind === "headers" ? (mProvider.headers ?? {}) : (mProvider.requestDefaults ?? {}), null, 2);
                const hint = mKind === "models" ? "One model id per line (used for dropdown and /get-models injection)." : "Enter a JSON object (persisted on Save).";

                return `
              <div class="modal-backdrop">
                <div class="modal card">
                  <div class="title">${escapeHtml(title)}</div>
                  <div class="hint">${escapeHtml(hint)}</div>
                  <textarea class="mono" id="modalText" style="min-height:240px;">${escapeHtml(text)}</textarea>
                  <div class="row" style="margin-top:10px;justify-content:flex-end;">
                    <button class="btn" data-action="modalCancel">Cancel</button>
                    <button class="btn primary" data-action="modalApply">Apply</button>
                  </div>
                </div>
              </div>
	            `;
              })();

    return `
	      <div class="app-container">
	        ${appHeader}
	        ${official}
	        ${providersHtml}
	        ${historySummaryHtml}
	        ${endpointRules}
	        ${selfTestHtml}
	      </div>
	      ${modalHtml}
	    `;
  };
})();
