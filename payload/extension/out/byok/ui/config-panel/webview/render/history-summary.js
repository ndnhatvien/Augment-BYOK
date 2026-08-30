(function () {
  "use strict";

  const ns = (window.__byokCfgPanel = window.__byokCfgPanel || {});
  const { normalizeStr, uniq, escapeHtml, optionHtml } = ns;

  function numberOrEmpty(v) {
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : "";
  }

  ns.renderHistorySummaryPanel = function renderHistorySummaryPanel({ cfg, providers } = {}) {
    const c = cfg && typeof cfg === "object" ? cfg : {};
    const listProviders = Array.isArray(providers) ? providers : [];
    const historySummary = c.historySummary && typeof c.historySummary === "object" ? c.historySummary : {};
    const hsEnabled = historySummary.enabled === true;
    const hsProviderId = normalizeStr(historySummary.providerId);
    const hsModel = normalizeStr(historySummary.model);
    const hsByokModel = hsProviderId && hsModel ? `byok:${hsProviderId}:${hsModel}` : "";
    const hsPrompt = normalizeStr(historySummary.prompt);
    const hsTriggerStrategyRaw = normalizeStr(historySummary.triggerStrategy).toLowerCase();
    const hsTriggerStrategy = hsTriggerStrategyRaw === "ratio" || hsTriggerStrategyRaw === "chars" ? hsTriggerStrategyRaw : "auto";
    const hsTriggerOnContextRatio = numberOrEmpty(historySummary.triggerOnContextRatio);
    const hsTargetContextRatio = numberOrEmpty(historySummary.targetContextRatio);
    const hsTriggerOnHistorySizeChars = numberOrEmpty(historySummary.triggerOnHistorySizeChars);
    const hsContextWindowTokensDefault = numberOrEmpty(historySummary.contextWindowTokensDefault);
    const hsHistoryTailSizeCharsToExclude = numberOrEmpty(historySummary.historyTailSizeCharsToExclude);
    const hsMinTailExchanges = numberOrEmpty(historySummary.minTailExchanges);
    const hsMaxTokens = numberOrEmpty(historySummary.maxTokens);
    const hsTimeoutSeconds = numberOrEmpty(historySummary.timeoutSeconds);
    const hsCacheTtlMs = numberOrEmpty(historySummary.cacheTtlMs);
    const hsMaxSummarizationInputChars = numberOrEmpty(historySummary.maxSummarizationInputChars);
    const hsRollingSummary = historySummary.rollingSummary === true;

    let hsContextWindowTokensOverrides = "";
    try {
      const overrides = historySummary.contextWindowTokensOverrides;
      if (overrides && typeof overrides === "object" && !Array.isArray(overrides) && Object.keys(overrides).length) {
        hsContextWindowTokensOverrides = JSON.stringify(overrides, null, 2);
      }
    } catch {}

    const hsModelGroups = listProviders
      .map((p) => {
        const pid = normalizeStr(p?.id);
        const dm = normalizeStr(p?.defaultModel);
        const rawModels = Array.isArray(p?.models) ? p.models : [];
        const models = uniq(rawModels.map((m) => normalizeStr(m)).filter(Boolean).concat(dm ? [dm] : [])).sort((a, b) => a.localeCompare(b));
        return { pid, models };
      })
      .filter((g) => g && g.pid && Array.isArray(g.models) && g.models.length)
      .sort((a, b) => a.pid.localeCompare(b.pid));

    return `
	      <section class="settings-panel">
	        <header class="settings-panel__header">
	          <span>History Summary</span>
	          ${hsEnabled ? `<span class="status-badge status-badge--success">enabled</span>` : `<span class="status-badge status-badge--warning">disabled</span>`}
	        </header>
	        <div class="settings-panel__body">
	          <div class="form-grid">
	            <div class="form-group">
	              <label class="form-label">Enabled</label>
	              <label class="checkbox-wrapper"><input type="checkbox" id="historySummaryEnabled" ${hsEnabled ? "checked" : ""} /><span>Enabled</span></label>
	              <div class="text-muted text-xs">When enabled, a rolling summary is built in the background to avoid context overflow (only affects content sent to the upstream model).</div>
	            </div>
	            <div class="form-group">
	              <label class="form-label">Model</label>
	              <select id="historySummaryByokModel">
	                ${optionHtml({ value: "", label: "(follow current request)", selected: !hsByokModel })}
	                ${hsModelGroups
	                  .map((g) => {
	                    const options = g.models
	                      .map((m) => {
	                        const v = `byok:${g.pid}:${m}`;
	                        return optionHtml({ value: v, label: m, selected: v === hsByokModel });
	                      })
	                      .join("");
	                    return `<optgroup label="${escapeHtml(g.pid)}">${options}</optgroup>`;
	                  })
	                  .join("")}
	              </select>
	              <div class="text-muted text-xs">Leave empty to follow the current request model (only used for "generate summary"); the trigger-window check always uses the current conversation model.</div>
	            </div>
	            <div class="form-group form-grid--full">
	              <div class="flex-row flex-wrap"><button class="btn btn--small" data-action="clearHistorySummaryCache">Clear summary cache</button><span class="text-muted text-xs">Only clears the background summary reuse cache; does not affect UI history display.</span></div>
	            </div>
	            <div class="form-group form-grid--full">
	              <details class="endpoint-group">
	                <summary class="endpoint-group-summary"><span>Advanced</span><span class="row" style="gap:6px;"><span class="badge">trigger</span><span class="badge">tail</span><span class="badge">cache</span><span class="badge">window</span><span class="badge">prompt</span></span></summary>
	                <div class="endpoint-group-body">
	                  <div class="text-muted text-xs">Advanced parameters are optional; leave empty to fall back to defaults. Built-in defaults already cover common coding models (Claude4/GPT5/Gemini/Kimi).</div>
	                  <div style="height:10px;"></div>
	                  <div class="form-grid">
	                    <div class="form-group"><label class="form-label" for="historySummaryTriggerStrategy">Trigger Strategy</label><select id="historySummaryTriggerStrategy">${optionHtml({ value: "auto", label: "auto (recommended)", selected: hsTriggerStrategy === "auto" })}${optionHtml({ value: "ratio", label: "ratio", selected: hsTriggerStrategy === "ratio" })}${optionHtml({ value: "chars", label: "chars", selected: hsTriggerStrategy === "chars" })}</select></div>
	                    <div class="form-group"><label class="form-label" for="historySummaryTriggerOnHistorySizeChars">Trigger Chars (fallback)</label><input id="historySummaryTriggerOnHistorySizeChars" type="number" min="1" step="1" value="${escapeHtml(hsTriggerOnHistorySizeChars)}" placeholder="800000" /></div>
	                    <div class="form-group"><label class="form-label" for="historySummaryTriggerOnContextRatio">Trigger Ratio</label><input id="historySummaryTriggerOnContextRatio" type="number" min="0.1" max="0.95" step="0.01" value="${escapeHtml(hsTriggerOnContextRatio)}" placeholder="0.70" /></div>
	                    <div class="form-group"><label class="form-label" for="historySummaryTargetContextRatio">Target Ratio</label><input id="historySummaryTargetContextRatio" type="number" min="0.1" max="0.95" step="0.01" value="${escapeHtml(hsTargetContextRatio)}" placeholder="0.55" /></div>
	                    <div class="form-group"><label class="form-label" for="historySummaryHistoryTailSizeCharsToExclude">Tail Chars Exclude</label><input id="historySummaryHistoryTailSizeCharsToExclude" type="number" min="0" step="1" value="${escapeHtml(hsHistoryTailSizeCharsToExclude)}" placeholder="250000" /></div>
	                    <div class="form-group"><label class="form-label" for="historySummaryMinTailExchanges">Min Tail Exchanges</label><input id="historySummaryMinTailExchanges" type="number" min="1" step="1" value="${escapeHtml(hsMinTailExchanges)}" placeholder="2" /></div>
	                    <div class="form-group"><label class="form-label" for="historySummaryMaxTokens">Summary Max Tokens</label><input id="historySummaryMaxTokens" type="number" min="1" step="1" value="${escapeHtml(hsMaxTokens)}" placeholder="1024" /></div>
	                    <div class="form-group"><label class="form-label" for="historySummaryTimeoutSeconds">Summary Timeout (s)</label><input id="historySummaryTimeoutSeconds" type="number" min="1" step="1" value="${escapeHtml(hsTimeoutSeconds)}" placeholder="60" /></div>
	                    <div class="form-group"><label class="form-label" for="historySummaryCacheTtlMs">Cache TTL (ms)</label><input id="historySummaryCacheTtlMs" type="number" min="0" step="1" value="${escapeHtml(hsCacheTtlMs)}" placeholder="0" /></div>
	                    <div class="form-group"><label class="form-label" for="historySummaryMaxSummarizationInputChars">Summarization Input Chars</label><input id="historySummaryMaxSummarizationInputChars" type="number" min="0" step="1" value="${escapeHtml(hsMaxSummarizationInputChars)}" placeholder="250000" /></div>
	                    <div class="form-group"><label class="form-label" for="historySummaryContextWindowTokensDefault">Context Window Default (tokens)</label><input id="historySummaryContextWindowTokensDefault" type="number" min="0" step="1" value="${escapeHtml(hsContextWindowTokensDefault)}" placeholder="0" /></div>
	                    <div class="form-group"><label class="form-label">Rolling Summary</label><label class="checkbox-wrapper"><input type="checkbox" id="historySummaryRollingSummary" ${hsRollingSummary ? "checked" : ""} /><span>Enable cached incremental summary</span></label></div>
	                    <div class="form-group form-grid--full"><label class="form-label" for="historySummaryContextWindowTokensOverrides">Context Window Overrides (JSON object)</label><textarea class="mono" id="historySummaryContextWindowTokensOverrides" rows="6" placeholder='{"gpt-5.3-codex":400000,"gpt-5.2":400000,"claude-4.6-opus":1000000,"gemini-3-pro":1000000,"kimi-k2":128000}'>${escapeHtml(hsContextWindowTokensOverrides)}</textarea><div class="text-muted text-xs">Substring match against the "current conversation model name", longest match wins; case-insensitive. This does not change the summary model.</div></div>
	                    <div class="form-group form-grid--full"><label class="form-label" for="historySummaryPrompt">Prompt</label><textarea class="mono" id="historySummaryPrompt" rows="6" placeholder="(default)">${escapeHtml(hsPrompt)}</textarea><div class="text-muted text-xs">Keep it concise and structured; avoid leaking sensitive information. Leave empty to fall back to the default template.</div></div>
	                  </div>
	                </div>
	              </details>
	            </div>
	          </div>
	        </div>
	      </section>
	    `;
  };
})();
