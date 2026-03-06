(function () {
  "use strict";

  const ns = (window.__byokCfgPanel = window.__byokCfgPanel || {});
  const { normalizeStr, escapeHtml } = ns;

  function getEndpointCatalogV1() {
    return typeof ns.getEndpointCatalogV1 === "function" ? ns.getEndpointCatalogV1() : { meanings: {}, llmEndpoints: [] };
  }

  function asObject(v) {
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  }

  ns.renderPromptsPanel = function renderPromptsPanel({ cfg } = {}) {
    const c = cfg && typeof cfg === "object" ? cfg : {};
    const prompts = asObject(c.prompts) || {};
    const endpointSystem = asObject(prompts.endpointSystem) || {};
    const endpointCount = Object.values(endpointSystem).filter((v) => Boolean(normalizeStr(v))).length;

    const { meanings, llmEndpoints } = getEndpointCatalogV1();
    const endpoints = (Array.isArray(llmEndpoints) ? llmEndpoints : []).filter((ep) => normalizeStr(ep) && normalizeStr(ep) !== "/get-models");
    const configured = endpointCount > 0;
    const badge = configured
      ? `<span class="status-badge status-badge--success">configured</span>`
      : `<span class="status-badge status-badge--warning">default</span>`;

    const overridesOpenAttr = configured ? " open" : "";
    const overridesHtml = endpoints.length
      ? `
          <details class="endpoint-group"${overridesOpenAttr}>
            <summary class="endpoint-group-summary">
              <span>Endpoint Overrides（${escapeHtml(String(endpoints.length))}）</span>
              <span class="row" style="gap:6px;">
                <span class="badge">${escapeHtml(String(endpointCount))} configured</span>
              </span>
            </summary>
            <div class="endpoint-group-body">
              <div class="text-muted text-xs">Append system prompt per endpoint (empty = no append).</div>
              <div class="text-muted text-xs">Note: <span class="text-mono">/get-models</span> does not use prompts (it is only a model list).</div>
              <div style="height:10px;"></div>
              <div class="form-grid">
                ${endpoints
                  .map((ep) => {
                    const desc = typeof meanings?.[ep] === "string" ? meanings[ep] : "";
                    const v = normalizeStr(endpointSystem?.[ep]);
                    return `
                      <div class="form-group">
                        <label class="form-label">
                          <span class="text-mono">${escapeHtml(ep)}</span>
                        </label>
                        <textarea class="mono" rows="3" data-prompt-ep="${escapeHtml(ep)}" data-prompt-key="system" placeholder="(optional)">${escapeHtml(v)}</textarea>
                        ${desc ? `<div class="text-muted text-xs">${escapeHtml(desc)}</div>` : ``}
                      </div>
                    `;
                  })
                  .join("")}
              </div>
            </div>
          </details>
        `
      : `<div class="text-muted text-xs">(no LLM endpoints found)</div>`;

    return `
	      <section class="settings-panel">
	        <header class="settings-panel__header">
	          <div class="flex-row flex-wrap">
	            <span>Prompts</span>
	            ${badge}
	            ${endpointCount ? `<span class="status-badge">${escapeHtml(String(endpointCount))} overrides</span>` : ""}
	          </div>
	        </header>
	        <div class="settings-panel__body">
	          <div class="text-muted text-xs">These prompts are appended to BYOK upstream model system prompts (BYOK only, not official).</div>
	          <div class="text-muted text-xs">For global rules/preferences, use Augment built-in User Guidelines / Workspace Guidelines / Rules; this panel only provides endpoint-level append.</div>
	          <div style="height:10px;"></div>
	          <div class="form-grid">
              <div class="form-group form-grid--full">
                <div class="flex-row flex-wrap" style="gap:6px;align-items:center;">
                  <button class="btn btn--small" data-action="promptsApplyRecommended" title="Overwrite current Prompts with recommended templates (export backup first)">Apply Recommended</button>
                  <span class="text-muted text-xs">Overwrite current endpoint overrides; Reload can revert unsaved changes.</span>
                </div>
              </div>
	            <div class="form-group form-grid--full">${overridesHtml}</div>
	          </div>
	        </div>
	      </section>
	    `;
  };
})();
