(function () {
  "use strict";

  const ns = (window.__byokCfgPanel = window.__byokCfgPanel || {});
  const { normalizeStr, uniq, escapeHtml, optionHtml } = ns;

  /**
   * Render History Summary panel (split restored from config-panel.webview.render.js + Advanced fields aligned).
   * Keep signature consistent with app.js line 235: ns.renderHistorySummaryPanel({ cfg, providers })
   * @param {{ cfg: object, providers: Array }} options
   * @returns {string} HTML
   */
  ns.renderHistorySummaryPanel = function renderHistorySummaryPanel({ cfg, providers } = {}) {
    const c = cfg && typeof cfg === "object" ? cfg : {};
    const providersList = Array.isArray(providers) ? providers : [];

    const hs = c.historySummary && typeof c.historySummary === "object" ? c.historySummary : {};
    const hsEnabled = hs.enabled === true;
    const hsProviderId = normalizeStr(hs.providerId);
    const hsModel = normalizeStr(hs.model);
    const hsByokModel = hsProviderId && hsModel ? `byok:${hsProviderId}:${hsModel}` : "";

    /* ---------- Model dropdown ---------- */
    const hsModelGroups = providersList
      .map((p) => {
        const pid = normalizeStr(p?.id);
        const dm = normalizeStr(p?.defaultModel);
        const rawModels = Array.isArray(p?.models) ? p.models : [];
        const models = uniq(rawModels.map((m) => normalizeStr(m)).filter(Boolean).concat(dm ? [dm] : [])).sort((a, b) => a.localeCompare(b));
        return { pid, models };
      })
      .filter((g) => g && g.pid && Array.isArray(g.models) && g.models.length)
      .sort((a, b) => a.pid.localeCompare(b.pid));

    /* ---------- Advanced fields ---------- */
    const triggerStrategy = normalizeStr(hs.triggerStrategy);
    const prompt = typeof hs.prompt === "string" ? hs.prompt : "";
    const rollingSummary = hs.rollingSummary === true;

    const intVal = (v) => (Number.isFinite(Number(v)) ? String(v) : "");
    const numVal = (v) => (Number.isFinite(Number(v)) ? String(v) : "");

    const contextWindowTokensOverrides =
      hs.contextWindowTokensOverrides && typeof hs.contextWindowTokensOverrides === "object" && !Array.isArray(hs.contextWindowTokensOverrides)
        ? JSON.stringify(hs.contextWindowTokensOverrides, null, 2)
        : "";

    /* ---------- HTML ---------- */
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
              <label class="checkbox-wrapper">
                <input type="checkbox" id="historySummaryEnabled" ${hsEnabled ? "checked" : ""} />
                <span>Enabled</span>
              </label>
              <div class="text-muted text-xs">When enabled, background rolling summaries are generated to avoid context overflow (only affects content sent to upstream model).</div>
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
              <div class="text-muted text-xs">Empty = follow current chat model; candidates come from providers[].models.</div>
            </div>
            <div class="form-group form-grid--full">
              <div class="flex-row flex-wrap">
                <button class="btn btn--small" data-action="clearHistorySummaryCache">Clear summary cache</button>
                <span class="text-muted text-xs">Clears only backend summary reuse cache; does not affect UI history display.</span>
              </div>
            </div>
          </div>

          <details class="endpoint-group" style="margin-top:12px;">
            <summary class="endpoint-group-summary">
              <span>Advanced</span>
              <span class="badge">prompt</span>
            </summary>
            <div class="endpoint-group-body">
              <div class="text-muted text-xs">Advanced parameters; empty = use defaults. Heavy fields (summaryNodeRequestMessageTemplate / abridgedHistoryParams) are better maintained via JSON import/export.</div>
              <div style="height:10px;"></div>
              <div class="form-grid">
                <div class="form-group form-grid--full">
                  <label class="form-label">Prompt</label>
                  <textarea class="mono" rows="4" id="historySummaryPrompt" placeholder="(default)">${escapeHtml(prompt)}</textarea>
                  <div class="text-muted text-xs">System prompt sent to LLM for summary generation; empty = built-in default.</div>
                </div>
                <div class="form-group">
                  <label class="form-label">Rolling Summary</label>
                  <label class="checkbox-wrapper">
                    <input type="checkbox" id="historySummaryRollingSummary" ${rollingSummary ? "checked" : ""} />
                    <span>Enabled</span>
                  </label>
                  <div class="text-muted text-xs">Rolling summary: incrementally update based on previous summary at each trigger.</div>
                </div>
                <div class="form-group">
                  <label class="form-label">Trigger Strategy</label>
                  <select id="historySummaryTriggerStrategy">
                    ${optionHtml({ value: "", label: "(auto)", selected: !triggerStrategy || triggerStrategy === "auto" })}
                    ${optionHtml({ value: "ratio", label: "ratio", selected: triggerStrategy === "ratio" })}
                    ${optionHtml({ value: "chars", label: "chars", selected: triggerStrategy === "chars" })}
                  </select>
                  <div class="text-muted text-xs">auto = smart strategy (recommended); ratio = by context ratio; chars = by character count.</div>
                </div>
                <div class="form-group">
                  <label class="form-label">Trigger On Context Ratio</label>
                  <input type="number" id="historySummaryTriggerOnContextRatio" value="${numVal(hs.triggerOnContextRatio)}" placeholder="0.7" step="0.05" min="0.1" max="0.95" />
                  <div class="text-muted text-xs">Context ratio trigger threshold (effective for auto/ratio; default 0.7).</div>
                </div>
                <div class="form-group">
                  <label class="form-label">Target Context Ratio</label>
                  <input type="number" id="historySummaryTargetContextRatio" value="${numVal(hs.targetContextRatio)}" placeholder="0.55" step="0.05" min="0.1" max="0.95" />
                  <div class="text-muted text-xs">Compression target ratio (default 0.55).</div>
                </div>
                <div class="form-group">
                  <label class="form-label">Trigger On History Size Chars</label>
                  <input type="number" id="historySummaryTriggerOnHistorySizeChars" value="${intVal(hs.triggerOnHistorySizeChars)}" placeholder="800000" min="1" />
                  <div class="text-muted text-xs">Base chars threshold (used directly in chars mode; fallback in auto/ratio when window can't be inferred).</div>
                </div>
                <div class="form-group">
                  <label class="form-label">History Tail Size Chars To Exclude</label>
                  <input type="number" id="historySummaryHistoryTailSizeCharsToExclude" value="${intVal(hs.historyTailSizeCharsToExclude)}" placeholder="250000" min="0" />
                  <div class="text-muted text-xs">Tail raw-text budget (goes into end_part_full).</div>
                </div>
                <div class="form-group">
                  <label class="form-label">Min Tail Exchanges</label>
                  <input type="number" id="historySummaryMinTailExchanges" value="${intVal(hs.minTailExchanges)}" placeholder="2" min="1" />
                  <div class="text-muted text-xs">Minimum tail exchanges to keep (avoid orphaned tool_result).</div>
                </div>
                <div class="form-group">
                  <label class="form-label">Max Tokens</label>
                  <input type="number" id="historySummaryMaxTokens" value="${intVal(hs.maxTokens)}" placeholder="1024" min="1" />
                  <div class="text-muted text-xs">max_tokens for summary LLM output.</div>
                </div>
                <div class="form-group">
                  <label class="form-label">Timeout Seconds</label>
                  <input type="number" id="historySummaryTimeoutSeconds" value="${intVal(hs.timeoutSeconds)}" placeholder="60" min="1" />
                  <div class="text-muted text-xs">Summary request timeout (seconds).</div>
                </div>
                <div class="form-group">
                  <label class="form-label">Max Summarization Input Chars</label>
                  <input type="number" id="historySummaryMaxSummarizationInputChars" value="${intVal(hs.maxSummarizationInputChars)}" placeholder="250000" min="0" />
                  <div class="text-muted text-xs">Maximum input characters sent to summary LLM.</div>
                </div>
                <div class="form-group">
                  <label class="form-label">Cache TTL (ms)</label>
                  <input type="number" id="historySummaryCacheTtlMs" value="${intVal(hs.cacheTtlMs)}" placeholder="0" min="0" />
                  <div class="text-muted text-xs">Summary cache TTL (ms; 0 = unlimited).</div>
                </div>
                <div class="form-group">
                  <label class="form-label">Context Window Tokens Default</label>
                  <input type="number" id="historySummaryContextWindowTokensDefault" value="${intVal(hs.contextWindowTokensDefault)}" placeholder="0" min="0" />
                  <div class="text-muted text-xs">Default model context window tokens (0 = use built-in table).</div>
                </div>
                <div class="form-group form-grid--full">
                  <label class="form-label">Context Window Tokens Overrides (JSON)</label>
                  <textarea class="mono" rows="4" id="historySummaryContextWindowTokensOverrides" placeholder='{"model-name": 128000}'>${escapeHtml(contextWindowTokensOverrides)}</textarea>
                  <div class="text-muted text-xs">Model window overrides (JSON object); longest-substring, case-insensitive matching.</div>
                </div>
              </div>
            </div>
          </details>
        </div>
      </section>
    `;
  };
})();
