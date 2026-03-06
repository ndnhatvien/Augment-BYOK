(function () {
  "use strict";

  const ns = (window.__byokCfgPanel = window.__byokCfgPanel || {});
  if (!ns || typeof ns.normalizeStr !== "function") return;

  const { normalizeStr } = ns;

  const RECOMMENDED_PROMPTS_V1 = Object.freeze({
    endpointSystem: Object.freeze({
      "/chat": [
        "Answer in the user's language by default.",
        "Priority: correctness > minimal change > consistency; avoid unrelated refactors.",
        "When modifying code: remove dead/legacy/duplicate logic; keep existing style and interfaces; add tests/docs only when necessary.",
        "Output: provide conclusion/next step first, then required details; ask clarifying questions when uncertain."
      ].join("\n"),
      "/chat-stream": [
        "Answer in the user's language by default.",
        "Priority: correctness > minimal change > consistency; avoid unrelated refactors.",
        "When modifying code: remove dead/legacy/duplicate logic; keep existing style and interfaces; add tests/docs only when necessary.",
        "Output in chunks, but do not omit the final conclusion/next step."
      ].join("\n"),
      "/completion": "Follow existing style. Output only the completion text. Avoid explanations and markdown.",
      "/chat-input-completion": "Follow existing style. Output only the completion text. Avoid explanations and markdown.",
      "/edit": "Output only replacement code. Preserve formatting and surrounding style. No extra commentary.",
      "/instruction-stream": "Stream only replacement code. Preserve formatting and surrounding style. No extra commentary.",
      "/smart-paste-stream": "Stream only the final pasted content. Preserve formatting. No extra commentary.",
      "/next-edit-stream": "Output only replacement code for the selected range. Prefer minimal, safe edits.",
      "/next_edit_loc":
        "Return STRICT JSON only (no markdown, no comments, no trailing commas). Prefer minimal, high-signal locations backed by diagnostics/recent changes.",
      "/prompt-enhancer": "Rewrite the prompt to be clearer while preserving constraints. Keep the original language. Output only the improved prompt text.",
      "/generate-commit-message-stream": "Output one concise English commit subject (Conventional Commits if applicable). No quotes, no trailing period.",
      "/generate-conversation-title": "Output a short, specific English title (<= 8 words). No quotes. No markdown."
    })
  });

  ns.RECOMMENDED_PROMPTS_V1 = RECOMMENDED_PROMPTS_V1;

  ns.handlePromptsAction = function handlePromptsAction({ action, gatherConfigFromDom, setUiState } = {}) {
    const a = normalizeStr(action);
    if (a !== "promptsApplyRecommended") return false;
    if (typeof gatherConfigFromDom !== "function" || typeof setUiState !== "function") return false;

    const cfg = gatherConfigFromDom();
    cfg.prompts = cfg.prompts && typeof cfg.prompts === "object" && !Array.isArray(cfg.prompts) ? cfg.prompts : (cfg.prompts = {});

    cfg.prompts.endpointSystem = { ...RECOMMENDED_PROMPTS_V1.endpointSystem };
    try {
      delete cfg.prompts.activePresetId;
      delete cfg.prompts.presets;
      delete cfg.prompts.globalSystem;
    } catch {}

    setUiState({ cfg, status: "Recommended prompts applied (pending save).", dirty: true }, { preserveEdits: false });
    return true;
  };
})();
