# Augment-BYOK (please PR merge ASAP to avoid drifting from this repo)

A single VSIX: routes **8 Augment LLM data-plane endpoints** to BYOK (with Streaming + tool use); all other endpoints keep official behavior; supports one-click runtime rollback (no Rust / external service needed).

Default relay: `https://acemcp.heroman.wtf/relay/`. Before using official `/get-models` merging and official context injection, register at `https://acemcp.heroman.wtf/login` and fill in your own API Token; this project no longer bundles or randomly assigns keys.

## Install (Recommended: Releases)

- Download `augment.vscode-augment.*-byok.*.vsix` from GitHub Releases (tag: `rolling`)
- VS Code → Extensions → `...` → `Install from VSIX...` → Reload Window

## Quick Setup (Panel)

1. Run `BYOK: Open Config Panel`
2. Configure at least 1 `providers[]` → `Save` (Base URL is auto-filled with defaults per type)
3. Run `BYOK: Enable` (the 8 endpoints are only taken over when `runtimeEnabled=true`)
4. Optional: pick `byok:<providerId>:<modelId>` in the Model Picker (injected by `/get-models`)

Config storage: VS Code extension `globalState` (includes Key/Token; not part of Sync). Fields and constraints are described in the "Configuration System" and "routing.rules (endpoint routing rules)" sections below; see `config.example.json` for an example.

Optional: the panel supports `Self Test` (one-click verification of models/chat/chat-stream + tool chain).

Common commands:
- `BYOK: Enable` / `BYOK: Disable (Rollback)`
- `BYOK: Reload Config`
- `BYOK: Import Config` / `BYOK: Export Config`
- `BYOK: Clear History Summary Cache`

## Provider Support (4 types)

- `openai_compatible`: `POST {baseUrl}/chat/completions` (SSE)
- `openai_responses`: `POST {baseUrl}/responses` (SSE; supports `incomplete_details.reason`→`stop_reason`)
- `anthropic`: `POST {baseUrl}/messages` (SSE)
- `gemini_ai_studio`: `.../v1beta/models/<model>:streamGenerateContent?alt=sse`

Protocol adaptation details (tools / stop_reason / usage / fallbacks / common gateway differences) are in the "Provider Support Matrix" section below.

## 7 Endpoints (taken over by the BYOK shim)

- `callApi` (4): `/get-models`, `/chat`, `/completion`, `/chat-input-completion`
- `callApiStream` (3): `/chat-stream`, `/prompt-enhancer`, `/generate-commit-message-stream`

> The current upstream `augment/vscode-augment` no longer has `/edit`, `/generate-conversation-title`, `/next_edit_loc`, `/instruction-stream`, `/smart-paste-stream`, or `/next-edit-stream`, so the default BYOK coverage matrix has converged to 7 endpoints.

The full endpoint range (47/7) is described in the "Endpoint Coverage (47 / 7) and Routing Strategy" section below.

## Troubleshooting (frequent)

- 401/403: check `apiKey`/`headers`; don't write a `Bearer ` prefix twice (`apiKey` adds Bearer automatically; `headers.authorization` should be the full value).
- 404/HTML: `baseUrl` is likely missing `/v1` (usually required by OpenAI/Anthropic compatible endpoints).
- Streaming with no output: confirm the upstream supports `text/event-stream`; recommended to run `Self Test` in the panel to locate the issue (models / chat / chat-stream).
- Anthropic stream 422 `system: invalid type: string`: mostly seen with "Anthropic compatible proxy" implementation differences; a built-in blocks-compatibility fallback retry exists (if it still fails, confirm `baseUrl` points to `/messages` and the proxy supports SSE).
- BYOK not taking effect: confirm you've `Save`d (hot reload only affects subsequent requests) and `BYOK: Enable` (runtimeEnabled=true).

## Local Build

Prerequisites: Node.js 20+, Python runtime, access to the Marketplace (prefer `python3`; on Windows use `py -3`; otherwise fall back to `python`)

- Quick check (no upstream cache needed): `npm run check:fast`
- Full check (requires cached upstream VSIX): `npm run upstream:analyze` (once) → `npm run check`
- Build: `npm run build:vsix` (output: `dist/augment.vscode-augment.<upstreamVersion>-byok.<buildId>.vsix`)
- CachyOS / Arch: `./scripts/build-cachyos.sh` — installs missing prereqs via pacman, runs gen + checks + analyze + build + coverage. Options: `--skip-install`, `--skip-upstream`, `--skip-checks`, `--full` (also runs contracts).

### Local ACE adapter (optional: replace the official context engine)

The 3 official context endpoints (`agents/codebase-retrieval`, `context-canvas/list`, `search-external-sources`) fail-open: without a working `official.completionUrl`/`official.apiToken`, injection is skipped with one downgrade log and BYOK chat continues. If you want codebase context without an official token, run a local ACE backend against a local index. Two ways:

1. **In-process local ACE (recommended)** — no adapter server, no token needed:
   - Backend: [elara-labs/code-context-engine](https://github.com/elara-labs/code-context-engine) — start with `cce serve --http` (default `http://127.0.0.1:8765`, `POST /search`, loopback needs no token).
   - Enable via config panel (Official section) or config: `official.localAceEnabled: true` and optionally `official.aceCceUrl` (default `http://127.0.0.1:8765`).
   - The extension calls CCE `/search` directly, formats `{formatted_retrieval}`, and injects it. No `official.apiToken` required, and injection runs even when the request has no blobs. CCE failures degrade to a warning (chat continues without the retrieval node).
   - **Tool calls**: when the model invokes the `codebase_retrieval` tool, BYOK also serves it from the same local CCE (using the tool's `information_request`), while the routing rule for `agents/codebase-retrieval` stays `disabled`. If local ACE is off, the workspace has no matching CCE index, or CCE is down, the tool falls back to the empty disabled response.
2. **Standalone adapter** — run a local HTTP adapter that implements the same 3 shapes:
   - Adapter: `npm run ace:adapter` (`tools/ace-adapter/server.js`, default `http://127.0.0.1:8310`). Maps `agents/codebase-retrieval` → CCE `/search` and returns `{ formatted_retrieval }`; `context-canvas/list` and `search-external-sources` return empty (fail-open, no injection).
   - Wire-up: set `official.completionUrl` to `http://127.0.0.1:8310` and any non-empty `official.apiToken` (the adapter accepts any bearer token; set `ACE_ADAPTER_TOKEN` to require a specific one).
   - Adapter env vars: `ACE_ADAPTER_HOST` (default `127.0.0.1`), `ACE_ADAPTER_PORT` (default `8310`), `ACE_ADAPTER_TOKEN` (optional), `ACE_CCE_URL` (default `http://127.0.0.1:8765`), `ACE_CCE_TOKEN` (optional), `ACE_CCE_TOP_K` (default `10`), `ACE_CCE_CONFIDENCE_THRESHOLD` (default `0.2`), `ACE_CCE_TIMEOUT_MS` (default `8000`).

> Note: `official.disableContextInjection` (or per-request `disable_retrieval`) disables all three official context injections, including the in-process local ACE path.

### MCP context injection (optional: pull context from MCP servers)

Beyond local CCE / official context, BYOK can inject context retrieved from external **MCP servers** (filesystem, databases, custom tools) into chat requests.

- Config: `mcp.enabled: true`, `mcp.injectPosition` (`before` | `after` | `replace`), and `mcp.servers` (`{ name, command, args, env }`).
- On activate, BYOK spawns each configured MCP server over stdio, and before chat requests queries them via `prompts/get` (then `resources/read` as fallback), merging results into the request.
- `before` (default) inserts the MCP node ahead of the official codebase-retrieval node; `after` appends after official retrieval nodes; `replace` drops official retrieval nodes (`-20`/`-21`) and inserts MCP instead.
- Fail-open: any server/query failure degrades to a warning and chat continues.
- Example: `{ "mcp": { "enabled": true, "injectPosition": "before", "servers": [{ "name": "files", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"] }] } }`

## Full Modification Feature List (the "full change surface" applied to the upstream VSIX)

> Note: "modification" here means the patches/replacements this repo applies to the upstream Augment VSIX when building `*.byok.vsix`, plus new capabilities added by the BYOK runtime code.  
> Status markers: `[x]` implemented; `[-]` partially implemented / conditional (details noted inline); `[ ]` not implemented (explicitly not doing / may do later).

### 0) Overall Goals and Boundaries (Scope / Non-goals)

- [x] Single VSIX: everything is packaged into one `*.vsix`, no Rust/external proxy service needed
- [x] Minimal blast radius: only takes over **8 LLM data-plane endpoints** (other endpoints stay official or disabled as needed)
- [x] Rollback: one-click runtime rollback (`runtimeEnabled=false` returns to the official path)
- [x] Auditable: locks upstream version and artifact sha256, and produces coverage matrix / full endpoint set reports
- [x] fail-fast: build fails immediately when an upstream upgrade breaks patch needles / contracts (avoid silent breakage)
- [x] No dependency on `augment.advanced.*` settings: contribution points removed at build time; never read/written at runtime
- [x] Single config source: only VS Code extension `globalState` (includes Key/Token, not part of Sync)
- [x] Runtime toggle stored separately and part of Sync: only `augment-byok.runtimeEnabled.v1` joins Sync, enabling "one-click rollback across devices"
- [ ] Non-goal: reimplementing control plane / permissions / Secrets / telemetry / Remote Agents (keep official implementation; use `disabled` as a fallback when necessary)
- [ ] Non-goal: introducing env/yaml/SecretStorage as config sources (avoid multi-source drift and audit difficulty)

### 1) Build and Artifacts (Build / Artifacts)

- [x] Single source of truth for building: `tools/build/build-vsix.js`
- [x] Upstream VSIX download/unpack: downloaded to `.cache/upstream/*.vsix`, unpacked to `.cache/work/*`
- [x] Support skipping download to reuse cache: `build-vsix --skip-download`
- [x] Overlay runtime code and UI: overlay `payload/extension/out/byok/*` onto upstream `extension/out/byok/*`
- [x] Reuse upstream VSIX download/unpack: `tools/lib/upstream-vsix.js` (shared by build / analyze / contracts)
- [x] Reuse BYOK patch orchestration: `tools/lib/byok-workflow.js` (avoid drift between build and contract scripts)
- [x] Artifact output: `dist/augment.vscode-augment.<upstreamVersion>-byok.<buildId>.vsix`
- [x] Artifact lock file (upstream + artifact sha): `upstream.lock.json` / `dist/upstream.lock.json`
- [x] Endpoint coverage report: `dist/endpoint-coverage.report.md` (LLM endpoint coverage matrix)
- [x] Upstream endpoint full-set analysis: `.cache/reports/upstream-analysis.json` (generated by `npm run upstream:analyze`)
- [x] Release asset name dedup: `dist/upstream.lock.json` is copied to `dist.upstream.lock.json` (only for Release assets)

### 2) Build-time Patch Surface (strictly controlled & auditable)

#### 2.1 Entry injection (bootstrap)

- [x] Injection method: inject the BYOK bootstrap into upstream `extension/out/extension.js`
- [x] Injection script: `tools/patch/patch-extension-entry.js`
- [x] Injection consistency audit: contracts check the bootstrap marker; the lock file only records upstream and artifact shas
- [x] Design principle: no longer depend on external `augment-interceptor` payload; no machine fingerprint / session spoofing logic

#### 2.2 Surgical webview asset patches (upstream bundle layer)

- [x] History Summary node slimming: avoid memory blowups from stringify/clone of huge nodes on paths such as Editable History
  - [x] patch script: `tools/patch/patch-webview-history-summary-node.js`
  - [x] patch target: all `common-webviews/assets/*.js` matching `history_summary_node/HISTORY_SUMMARY/history_end`
  - [x] enabled by default: `historyonly` verified working; fixed at build time, no extra env vars exposed
  - [x] contracts match every asset to verify the marker and `TEXT/text_node` rewrite, avoiding missed patches across multiple bundles
- [x] Tool Use fallback removed: both `tooluseonly` and `toolusefix` blank out the main panel; the related patches/switches/tests have been deleted from main
- [x] Webview asset cache-bust: rename patched JS carrying the `__augment_byok_` marker and rewrite `common-webviews/*` references, avoiding VS Code/WebView reusing stale cache

#### 2.3 Inject BYOK runtime entry (bootstrap)

- [x] Inject bootstrap: inject `./byok/runtime/bootstrap` into upstream `extension/out/extension.js`
- [x] Injection script: `tools/patch/patch-extension-entry.js`
- [x] bootstrap capabilities: config management init, runtime toggle, shim mounting, hot-reload listener

#### 2.4 Expose a few upstream internal objects (Self Test only)

- [x] Purpose: Self Test covers "real tool execution" and needs access to upstream internal objects such as toolsModel / store
- [x] Injection script: `tools/patch/patch-expose-upstream.js`
- [x] Constraint: only expose necessary references to `globalThis`; do not change official business logic

#### 2.5 Official overrides (switch the source of official connection params)

- [x] Goal: change the source of official `completionURL/apiToken` from VS Code settings to `globalState`
- [x] Injection script: `tools/patch/patch-official-overrides.js`
- [x] Behavior: supports private tenants / official context injection (token optional; when missing, injection is skipped with one explicit downgrade log, without affecting the BYOK main path)

#### 2.6 Model picker patch (Model Picker: BYOK-only)

- [x] Goal: when `runtimeEnabled=true`, the Model Picker only shows `byok:*` (avoid the illusion of "picked official but BYOK actually ignores it")
- [x] Injection script: `tools/patch/patch-model-picker-byok-only.js`
- [x] Behavior: only takes over when BYOK is on; when off, returns to the official model merging logic

#### 2.7 Disable upstream hard chatHistory truncation (only when BYOK is on)

- [x] Goal: avoid the client truncating by turns/volume first, which turns historySummary/tool results into "orphaned context"
- [x] Injection script: `tools/patch/patch-disable-chat-history-truncation.js`
- [-] Trigger condition: only effective when `runtimeEnabled=true` (turning off BYOK does not change official behavior)

#### 2.8 callApi / callApiStream shim (endpoint-level takeover)

- [x] Injection point: inject a one-shot interceptor at the start of the upstream `callApi` / `callApiStream` methods
- [x] Injection script: `tools/patch/patch-callapi-shim.js`
- [x] Contract: `maybeHandleCallApi*()` returning `undefined` → falls back to upstream native logic (the key to soft rollback)
- [x] Side-effect boundary: the injection layer only passes through `arguments[5]/[10]`; it does not read upstream config token, stringify completionURL, or mutate body in place
- [x] Routing modes: `byok | official | disabled`

#### 2.9 package.json patches (minimize command/settings contribution points)

- [x] Inject BYOK commands: `BYOK: Enable/Disable/Reload/Open Panel/Import/Export/Clear Cache`
- [x] Remove `augment.advanced.*` settings contribution points: avoid misreading/miswriting upstream advanced settings
- [x] Injection script: `tools/patch/patch-package-json-commands.js`

#### 2.10 Build-time guards + contracts (fail-fast)

- [x] guard script: `tools/patch/guard-no-autoauth.js`
- [x] `node --check`: syntax-check the JS after key injections (avoid an unloadable artifact)
  - [x] check script: `tools/check/node-check-js.js`
- [x] BYOK contract checks: ensure markers/runtime files/protocol enums/model registry feature_flags satisfy the minimal contract
  - [x] contracts entry: `tools/check/byok-contracts/main.js`
  - [x] sub-check: `tools/check/byok-contracts/check-callapi-shim.js`
  - [x] sub-check: `tools/check/byok-contracts/check-protocol-enums.js`
  - [x] sub-check: `tools/check/byok-contracts/check-augment-protocol-shapes.js`

### 3) Runtime Toggle / Rollback

- [x] BYOK runtime toggle storage: `augment-byok.runtimeEnabled.v1`
- [x] Config storage: `augment-byok.config.v1` (includes Key/Token; not part of Sync)
- [x] History Summary cache storage: `augment-byok.historySummaryCache.v1` (not part of Sync)
- [x] Soft rollback semantics: when `runtimeEnabled=false`, `maybeHandleCallApi*()` returns `undefined`/empty stream directly → official logic takes over
- [x] Soft rollback side-effect boundary: when disabled, does not load BYOK config, does not clear historySummary cache, does not capture upstream call host; the injection layer also does not read upstream token/config or mutate body
- [x] One-click rollback command: `BYOK: Disable (Rollback)` (does not clear config, only toggles runtime)
- [x] One-click enable command: `BYOK: Enable`
- [x] Hot reload: after `Save` in the panel, takes effect for "subsequent requests" (no Reload Window needed)
- [x] Strict failure: when routing is BYOK and official assembly / endpoint assembly fails, throw an error directly (avoid silent mismatch)

### 4) Configuration System (globalState v1: fields / constraints / compatibility)

#### 4.1 Config entry and editing experience

- [x] Webview panel: `BYOK: Open Config Panel`
- [x] Panel persistence: `retainContextWhenHidden=true` (reduce state loss from frequent recreation)
- [x] Only local resources allowed: `localResourceRoots=[out/byok/ui/config-panel]`
- [x] Panel supports `Reload`: discards unsaved edits, back to the last-good config
- [x] Panel status notifications: save/import/export/self-test results are pushed to the UI status area

#### 4.2 Import / Export (JSON)

- [x] `BYOK: Export Config` (optional redact / include secrets)
  - [x] Export: `include secrets` (for backup/migration)
  - [x] Export: `redact secrets` (sensitive fields replaced with `<redacted>`, for sharing templates)
- [x] `BYOK: Import Config` (optional merge/replace)
  - [x] Import: `Merge (preserve existing secrets)` (import but keep currently stored secrets when the imported field is empty or `<redacted>`)
  - [x] Import: `Replace (overwrite everything)` (full overwrite; secrets are also overwritten/cleared)

#### 4.3 Field spec and compatibility strategy

- [x] Config version: `version=1`
- [x] Field names strictly camelCase (v1 no longer supports old aliases such as `base_url` / `history_summary`)
- [x] Config normalization: endpoint keys normalized to pathname (e.g. `"/chat-stream?x=1"` → `"/chat-stream"`)
- [x] Prototype pollution protection: reject/filter unsafe keys like `__proto__` / `prototype` / `constructor` (both config and UI messages use hasOwnProperty guards)
- [x] BYOK internal field isolation: BYOK-internal keys in `requestDefaults` are stripped before being sent upstream (avoid polluting upstream requests)

#### 4.4 Official connection (for: /get-models merging; can also switch to a private tenant)

- [x] `official.completionUrl`: default `https://acemcp.heroman.wtf/relay/` (switchable to a private tenant)
- [x] `official.apiToken`: empty by default; register at `https://acemcp.heroman.wtf/login` and fill in your own API Token; clearing it skips official `/get-models` and context injection with one downgrade log
- [x] Official context injection entry points: `agents/codebase-retrieval` / `search-external-sources` / `context-canvas/list`

#### 4.5 providers[] (BYOK upstream list)

- [x] At least 1 provider is required for `mode=byok` to take effect
- [x] provider base fields: `id` / `type` / `baseUrl` / `models[]` / `defaultModel` / `apiKey?` / `headers?` / `requestDefaults?` / `underlyingModelMapping?`
- [x] `underlyingModelMapping.titleGeneration/summary`: only overrides the current provider's model selection for internal "title generation / conversation summary" requests when `silent=true`
- [x] providerId semantics: model id looks like `byok:<providerId>:<modelId>`
- [x] provider types (generated single source of truth, see `tools/gen/sync-provider-types.js`):
  - [x] `openai_compatible`
  - [x] `openai_responses`
  - [x] `anthropic`
  - [x] `gemini_ai_studio`

#### 4.6 routing.rules (endpoint routing rules)

- [x] Rule structure: `routing.rules[endpoint]={ mode, providerId?, model? }`
- [x] `mode=byok`: goes through BYOK (semantic implementation only for the 8 LLM data-plane endpoints)
- [x] `mode=official`: force official (not taken over even when runtimeEnabled=true)
- [x] `mode=disabled`: direct no-op (`callApi` returns `{}`, `callApiStream` returns an empty stream)
- [-] Rule merging: user rules merged with default rules; not recommended to hand-fill unknown endpoints (the upstream set may change on upgrade)

#### 4.7 Output limits (max tokens auto-inference)

- [x] When `providers[].requestDefaults` has no max tokens fields configured: BYOK auto-injects `max_output_tokens`
- [x] Inference strategy: infer the context-window size by model name + estimate prompt volume, giving an output budget that "won't be truncated easily" (with a safety margin)
- [x] Cross-provider compatibility: `max_output_tokens` is canonical; the provider mapping layer converts to each provider's field (e.g. Gemini's `generationConfig.maxOutputTokens`)
- [x] If a token-limit retry triggers: forcibly overwrite all max-tokens alias keys (including `generationConfig.maxOutputTokens`), avoiding priority bypasses across different mappings
- [x] When upstream rejects (token limit / context length): automatically shrink max tokens and retry (streaming only allows retry before any chunk is emitted, avoiding duplicate output)

#### 4.8 historySummary (rolling summary: context compression)

- [x] `historySummary.enabled`: default false (only effective when explicitly enabled)
- [-] `historySummary.providerId/model`: optional (only controls the "summary generation model"; when empty, falls back to the current provider/model)
- [x] Trigger size: `history + message + prefix/selected_code/suffix/diff` (UTF-8 bytes)
- [x] Trigger threshold: `triggerOnHistorySizeChars` (default 800000)
- [x] Trigger strategy: `triggerStrategy=auto|ratio|chars` (`auto` recommended)
- [x] Ratio thresholds: `triggerOnContextRatio` / `targetContextRatio` (defaults ~0.70 / 0.55; trigger threshold auto-clamped to 0.60~0.80)
- [x] Context-window estimation: `contextWindowTokensDefault` / `contextWindowTokensOverrides` (override: longest substring, case-insensitive)
- [x] Dual-model decoupling: the trigger window is judged by the current conversation model; the summary provider/model only controls "how the summary is generated"
- [x] Common overrides: `gpt-5.3-codex=400000`, `gpt-5.2=400000`, `claude-4.6-opus=1000000`, `gemini-3-pro=1000000`, `kimi-k2=128000`
- [x] Tail retention: `historyTailSizeCharsToExclude` (estimated in UTF-8 bytes) + `minTailExchanges`
- [x] Split consistency: after triggering, no second veto by the "history-only threshold" (avoid "triggered but not injected")
- [x] Summary generation limits: `maxTokens` / `timeoutSeconds` / `maxSummarizationInputChars` (estimated in UTF-8 bytes)
- [x] rolling summary cache: `rollingSummary=true` + `cacheTtlMs` (conversation-scoped cache, reducing repeated summarization)
- [x] Refresh strategy: only skip when the "current request already contains a summary node"; `chat_history` containing an old summary can still refresh
- [x] Default supervisor prompt template provided: `summaryNodeRequestMessageTemplate` + `abridgedHistoryParams`
- [x] Fallback: when summary generation fails/times out/is unconfigured, a fallback summary is still injected to force compression (avoiding request-overlarge direct failure)
- [x] Fallback: `tool_result` / `tool_use input` in `end_part_full` are mid-truncated (keeping the trailing reference id), preventing a single tool output from blowing up the context

### 5) Endpoint Coverage (47 / 7) and Routing Strategy

#### 5.1 Full endpoint set and coverage matrix

- [x] Upstream full endpoint set: `npm run upstream:analyze` → `.cache/reports/upstream-analysis.json`
- [x] LLM coverage matrix: `npm run report:coverage` → `dist/endpoint-coverage.report.md`
- [x] Endpoint descriptions: see "Endpoint Coverage (47 / 7) and Routing Strategy" in this doc

#### 5.2 The 7 LLM data-plane endpoints (BYOK semantic implementation)

- [x] `callApi` (4): `/get-models`, `/chat`, `/completion`, `/chat-input-completion`
- [x] `callApiStream` (3): `/chat-stream`, `/prompt-enhancer`, `/generate-commit-message-stream`
- [x] Single source of truth maintained in: `tools/report/llm-endpoints-spec.js`
- [x] Auto-generated sync: `npm run gen:llm-endpoints` (updates UI + default routing rules + official delegation)
- [x] shim secondary constraint: unimplemented endpoints stay official even when carrying a `byok:*` model override; they never enter the BYOK execution path
- [x] provider executability constraint: outside `/get-models`, when the target provider lacks `baseUrl` + usable auth/headers + known type, routing stays official

#### 5.3 The remaining 40 endpoints (default official / disabled as needed)

- [ ] Remote Agents (4): not taken over (depends on control plane / permissions / state machine), default official
- [ ] Agents / Tools (7): not taken over (remote tool routing), default official
- [ ] File / Blob / Context Sync (9): not taken over (depends on official storage/auth), default official
- [ ] Cloud Agents / Experts (2): not taken over (depends on official control plane), default official
- [ ] Account / Subscription / Permissions (5): not taken over, default official
- [ ] Feedback / Telemetry / Debug (11): not taken over (some default disabled, a few stay official)
- [ ] Notifications (2): not taken over (default official)

### 6) callApi (non-streaming) implementation details (4)

#### 6.1 `/get-models` (model registry + feature_flags injection)

- [x] Build byok models from BYOK config: inject `providers[].models` → `byok:<providerId>:<modelId>` only for "executable configs" (baseUrl configured + usable auth/headers + known provider.type)
- [x] Default model selection: prefer the first "executable" provider / its defaultModel; when no executable provider exists, `default_model` is empty and `models=[]`
- [-] Attempt to call official `/get-models` to obtain base flags (for compatibility with the upstream model registry)
- [x] Scrub model-registry-related fields from official `feature_flags` (avoid conflicts / double registration)
- [x] Inject model registry feature_flags (ensure upstream Model Picker / feature gates work)
- [x] Inject `models[]`: only `byok:*` returned (when runtimeEnabled=true, avoid the confusion of "official models mixed in")
- [-] Official call failure fallback: fall back to the local `byok models` list (no interruption)

#### 6.2 `/chat` (Augment chat → provider chat, non-streaming)

- [x] Official assembly (fixed): reuse the upstream `callApi` `body` (`source=upstream.callApiBody*`)
- [x] Request normalization: `normalizeAugmentChatRequest()` (unify fields/aliases/shape)
- [-] Optional historySummary: automatically compress chat_history when the trigger threshold is hit (ignore on failure)
- [-] upstream hydrate (ignore on failure): assets(file/image) / checkpoints (fill in attachments and editable history)
- [-] Official context injection (ignore on failure; needs official token): codebase-retrieval / external sources / context canvas (`disable_retrieval=true` can turn it off)
- [x] Output supplement: `checkpoint_not_found` / `workspace_file_chunks` (from official assembly meta or derived locally)

#### 6.3 `/completion` (text completion)

- [x] Official assembly (fixed): derive `system/messages` from the upstream body (`resolveByokTextPromptContext()`)
- [x] Provider text completion: `byokCompleteText()` (unified interface across providers)
- [x] Result wrapped into the Augment completion result structure (compatible with upstream transform)

#### 6.4 `/chat-input-completion` (input box completion)

- [x] Same semantics as `/completion` (shares the same implementation)

### 7) callApiStream (streaming) implementation details (4)

#### 7.1 `/chat-stream` (NDJSON: Augment chat chunks)

- [x] Upstream protocol alignment: outputs Augment chat chunks (including nodes / stop_reason / final chunk)
- [x] Provider stream: `streamAugmentChatChunksByProviderType()` (dispatched by provider.type)
- [x] Tool meta: built from `tool_definitions` (for tool card titles/groups/display)
- [-] Support `support_tool_use_start`: decide between TOOL_USE_START and TOOL_USE based on `feature_detection_flags`
- [-] Parallel tools support: decide whether to allow parallel tool calls based on `feature_detection_flags` (OpenAI side auto-falls back)
- [x] thinking/reasoning: aggregate into THINKING nodes when possible (pass through when the provider supports it)
- [x] token usage: output TOKEN_USAGE nodes when possible (pass through when the provider supports it)
- [x] max tokens: auto-inferred and injected when unconfigured; automatically shrink and retry on upstream rejection (retry only before any chunk is emitted)
- [x] Output supplement: `checkpoint_not_found` / `workspace_file_chunks` (injected once on the first chunk only)
- [x] Streaming safety net: `guardObjectStream()` converts exceptions into readable error chunks (avoid UI freezes)
- [x] Text stream wrappers converged: `chat_result delta` / `instruction-like replacement` / `next-edit complete` share the same trace label and stream wrapper helper; further cleanup below is mostly style-level gains

#### 7.2 `/prompt-enhancer` (streaming: chat_result delta wrapper)

- [x] Reuse provider text stream: `streamTextDeltasByProviderType()`
- [x] Output structure: wrap deltas into a `{ text: delta, nodes: [] }` chat_result structure
- [-] Adapt to different providers' SSE/JSON: auto-use the JSON parse path when content-type=JSON

#### 7.3 `/generate-commit-message-stream` (streaming: chat_result delta wrapper)

- [x] Same semantics as `/prompt-enhancer` (same implementation)

> **Removed**: `/next-edit-stream` has been deleted from upstream; BYOK no longer intercepts this endpoint.

### 8) Provider Support Matrix (upstream LLM compatibility layer)

#### 8.1 Common capabilities (cross-provider)

- [x] Unified entry: dispatch by `provider.type` (avoid chat/stream/self-test/historySummary drift)
- [x] SSE parser: `providers/sse.js` + `providers/sse-json.js` (unified JSON.parse / event types / stats)
- [x] HTTP util: `providers/http.js` (baseUrl join, request construction)
- [x] Retry and error extraction: `providers/request-util.js` (`fetchOkWithRetry` + error message extraction)
- [x] requestDefaults normalization/cleaning: `providers/request-defaults-util.js` (max-tokens alias normalization / unsupported-field stripping)
- [x] Unified tool/usage/final chunk construction: `providers/chat-chunks-util.js` (nodeId increment rules, stop_reason unification)
- [x] invalid request fallback: auto-downgrade the request on 400/422 (shrink to the minimal usable form)

#### 8.2 `openai_compatible` (OpenAI Chat Completions compatible)

- [x] Request path: `POST <baseUrl>/chat/completions`
- [x] Auth: `apiKey` auto-injects `Authorization: Bearer <token>` (avoid writing `Bearer ` twice)
- [-] Extra headers support: `providers[].headers` (e.g. proxy gateway custom auth)
- [x] Non-streaming text: extracted from `choices[0].message.content` / `choices[0].text`
- [x] Streaming text: parse SSE `choices[0].delta.content` (doneData=`[DONE]`)
- [x] chat-stream: convert SSE deltas into Augment `RAW_RESPONSE` nodes (per chunk)
- [-] tool calls: supports `delta.tool_calls[]` and legacy `delta.function_call` (auto-aggregated arguments)
- [x] Parallel tools fallback: when `supportParallelToolUse` is not true and tools exist, auto-inject `parallel_tool_calls=false` (also compatible with `parallelToolCalls`)
- [-] tools compatibility downgrade chain: tools → disable include_usage → disable tool_choice → minimal defaults → functions → no-tools
- [-] vision / multi-part content compatibility: gateways without multipart support are auto-flattened to plain text (with a notice about omitted non-text parts)
- [x] thinking/reasoning pass-through: aggregate `reasoning|thinking` fields into THINKING nodes (when provided upstream)
- [-] token usage pass-through: supports `usage.prompt_tokens / completion_tokens` + cached/creation tokens (when provided upstream)
- [x] stop_reason unification: map OpenAI finish_reason to Augment stop_reason and emit a final chunk

#### 8.3 `openai_responses` (OpenAI Responses API compatible)

- [x] Request path: `POST <baseUrl>/responses`
- [x] Auth: same as OpenAI (Bearer) + custom headers allowed
- [x] Input construction: convert Augment chat into responses `instructions + input[]`
  - [x] user text: `input_text`
  - [x] user images: `input_image` (data URL: `data:<mime>;base64,<data>`)
  - [x] tool calls: `function_call` (call_id/name/arguments)
  - [x] tool results: `function_call_output` (call_id/output)
- [-] tool pairing fix: auto-inject missing tool_result / convert orphan tool_result (keep upstream/downstream paired)
- [x] Non-streaming text: extracted from `output_text`/`output[]` (no text → explainable error)
- [-] Non-streaming fallback: some gateways only support SSE even with `stream=false` → automatically do one stream fallback to concatenate text
- [x] fallback error boundaries: non-streaming JSON error / stream fallback failed events fail-fast, no longer masquerading as "no text"
- [x] Streaming text: parse SSE `response.output_text.delta` / `response.output_text.done`
- [x] chat-stream: parse responses SSE and output Augment chunks (RAW_RESPONSE/THINKING/TOOL_USE/TOKEN_USAGE/final)
- [x] `status=incomplete` + `incomplete_details.reason`: mapped to Augment stop_reason (`max_output_tokens`→MAX_TOKENS; `content_filter`→SAFETY; others→UNSPECIFIED)
- [x] Ending fallback: when `response.completed`/final JSON arrives, pad any incomplete tail text (compatible with gateways missing the done event)
- [x] Tool schema strictness: fill in `additionalProperties=false`; object schemas force `required` to cover all `properties` (Responses is stricter about schemas)

#### 8.4 `anthropic` (Anthropic Messages API compatible)

- [x] Request path: `POST <baseUrl>/messages`
- [x] Auth: default `x-api-key: <token>` (can also be explicitly overridden with headers.authorization)
- [x] Non-streaming text: extracted from `content[].type=text`
- [x] Streaming text: parse SSE `content_block_delta(text_delta)` (until `message_stop`)
- [-] tool blocks compatibility: tool_result/tool_use blocks are stripped/flattened when necessary (better proxy compatibility)
- [-] image blocks compatibility: proxies without multimodal support strip image blocks (placeholder=`[image omitted]`)
- [-] tool_choice compatibility: automatically retry "no tool_choice" → "no tools + strip blocks" on failure
- [x] chat-stream downgrade chain regression: confirmed to remove `tool_choice` first, and only remove tools + flatten tool/image blocks if it still fails
- [x] `input_json_delta`: aggregate tool input JSON, output TOOL_USE chunks on block_stop
- [x] thinking blocks: aggregate `thinking_delta` and output THINKING nodes
- [-] 422 `system: invalid type: string` fallback: automatically convert system/messages.content to blocks form and retry (compatible with some proxy differences)
- [-] token usage: supports `usage.input_tokens/output_tokens` + cache_read/cache_creation (when provided upstream)

#### 8.5 `gemini_ai_studio` (Google Generative Language API / AI Studio compatible)

- [x] Request path: `<baseUrl>/v1beta/models/<model>:generateContent`
- [x] Streaming request: `...:streamGenerateContent?alt=sse`
- [x] Auth: `apiKey` written to query `?key=...` by default (headers can also override)
- [x] requestDefaults normalization: `max_tokens/max_output_tokens/...` → `generationConfig.maxOutputTokens`
- [x] Non-streaming text: extracted from `candidates[0].content.parts[].text`
- [x] Streaming text: Gemini often returns "cumulative full text"; only new text is emitted via deltas (avoid duplicates)
- [x] functionCall: parse `parts[].functionCall` and output TOOL_USE chunks (prefer `functionCall.id` as `tool_use_id`, dedup by id)
- [x] tool results: normalize tool_result into `functionResponse` parts (pass through `tool_use_id`→`functionResponse.id`, with orphan/missing fallbacks)
- [-] image inlineData: supports `parts[].inlineData` / `parts[].inline_data`; strip and use a placeholder on 400/422 compatible retries
- [x] Auth error boundaries: 401/403 do not trigger `no-defaults/no-images/no-tools` compatibility retries
- [x] stop_reason: map candidate `finishReason` to Augment stop_reason (unknown values default to END_TURN)
- [-] token usage: parse usage fields and output TOKEN_USAGE (when provided upstream)

### 9) Augment Chat Protocol Alignment (request/response nodes)

#### 9.1 Request Nodes support (input side)

- [x] TEXT: normalize user/system text into provider input
- [x] TOOL_RESULT: inject tool execution results into provider input (with summary/truncation fallbacks)
- [x] IMAGE: convert images (base64+format) into each provider's image part/block (or degrade/omit)
- [x] IMAGE_ID / FILE_ID / CHECKPOINT_REF: degrade to prompt text hints by default; the chat path tries to hydrate bytes/checkpoints from upstream when possible (ignore on failure)
- [x] HISTORY_SUMMARY: render the summary node as supervisor text (merging tool_results into end_part_full)

#### 9.2 Response Nodes construction (output side)

- [x] RAW_RESPONSE: output text per delta (chat-stream)
- [-] THINKING: output thinking/reasoning summary when the provider supports it (for UI/debug)
- [-] TOOL_USE / TOOL_USE_START: output when the provider supports tool calls (start/full decided by feature_detection_flags)
- [-] TOKEN_USAGE: output when the provider supports usage stats (including cache tokens)
- [x] FINAL: uniformly output the final chunk (stop_reason/endedCleanly/tool_use-related constraints)

### 10) Official Assembly (fixed)

- [x] chat / non-chat share the same delegation contract: unified `source/reason` normalization, audit wording, failure message format, and `checkpoint_not_found/workspace_file_chunks` meta extraction
- [x] LLM endpoints under `mode=byok` always use the official assembly result (`source=upstream.callApiBody*`)
- [x] `officialDelegation` config and request-level `delegate_*` overrides removed, avoiding dual-path complexity
- [x] text endpoint assembly: only extract `messages/input` from the upstream body (including bounded-depth nested search); fail-fast when missing, no hand-written builder restored
- [x] Execution ownership is decided only by `routing.rules[endpoint].mode`:
  - `byok`: official assembly + BYOK provider execution
  - `official`: official path execution

### 11) History Summary (rolling summary: context compression) implementation details

- [x] Runtime feature decoupled from the webview patch: `historySummary.enabled` controls whether summaries are generated; the `HISTORY_SUMMARY -> TEXT` slimming patch is always on
- [x] Trigger preconditions: `historySummary.enabled=true` and a `conversation_id` exists and chat_history is non-empty
- [x] No duplicates: only skipped when the current request already contains a summary node; an old summary in history can still be refreshed
- [x] Trigger decision: supports `chars` / `ratio` / `auto` (auto combines context-window estimation)
- [x] Trigger size definition: `history + message + prefix/selected_code/suffix/diff` (UTF-8 bytes)
- [x] Context-window base model: prefers the "current conversation model" (requestedModel; falls back to the current request's actual model when missing), decoupled from the summary generation model
- [x] Context-window estimation (inference): heuristic by coding model name (Claude4 / GPT5 / Gemini2.5-3 / Kimi)
- [x] Override priority: `contextWindowTokensOverrides` (longest substring match by model, case-insensitive) > `contextWindowTokensDefault` > inferred value
- [x] Common override references: `gpt-5.3-codex=400000`, `gpt-5.2=400000`, `claude-4.6-opus=1000000`, `gemini-2.5-pro=1000000`, `gemini-3-flash=1000000`, `kimi-k2=128000`
- [x] Tail selection: keep the trailing `historyTailSizeCharsToExclude` bytes (UTF-8 estimate) + at least `minTailExchanges` exchanges
- [x] Split consistency: after triggering, no second veto by the "history total only" threshold
- [x] Abridged middle: output a "middle summary" per `abridgedHistoryParams`, reducing token cost
- [x] Summary supervisor template: `summaryNodeRequestMessageTemplate` supports placeholders like `{summary}/{end_part_full}`
- [x] Provider request compression regression: after injecting the summary, the provider only receives summary/current tail/current request, no longer carrying the original giant payload with the dropped head
- [-] rolling summary cache: conversation-scoped cache (can recover earlier context when upstream truncation removes the summary exchange)
- [-] Editable History compatibility: when checkpoint-injected user-modified changes are detected, auto-invalidate that conversation's summary cache
- [x] One-click cache clear: `BYOK: Clear History Summary Cache`
- [x] Fallback: when summary generation fails, a fallback summary is still injected (keeping the compression path usable)
- [x] Fallback: `tool_result` / `tool_use input` in `end_part_full` are mid-truncated, avoiding context blowups

### 12) Workspace/Upstream Metadata (checkpoint_not_found / workspace_file_chunks)

- [x] Non-streaming and streaming share the same chat response meta helper: unify delegated/prep metadata, and constrain `workspace_file_chunks` to be injected once on the first stream chunk
- [-] The chat path hydrates assets/checkpoints as needed (ignore on failure; for attachments/editing-history completion)
- [x] `checkpoint_not_found`: passed through from official assembly meta (chat/chat-stream)
- [x] `workspace_file_chunks`: prefer passing through from official assembly meta; when missing, derive from the request (maxChunks=80)

### 13) Self Test (one-click panel check: models/chat/chat-stream + real tool testing)

- [x] Self Test entry: run from the panel with a click (streaming log output supported)
- [x] provider connectivity tests: models / complete / stream (per providerId)
- [x] tool_definitions capture: prefer the most recent real session capture; when empty, try pulling the "full real tool set" from the upstream toolsModel
- [-] Tool schema samplability check: ensure samples can be generated (validate schema validity / JSON-serializability)
- [-] Responses strict schema check: ensure openai_responses tool schemas satisfy strict constraints (additionalProperties=false etc.)
- [-] Real tool roundtrip: one real execution through the upstream toolsModel (has side effects: file/network/browser, decided by environment availability)
- [-] historySummary self-check: generate one summary with an available provider (verify trigger/template/injection chain)

### 14) Hardening / Security and Stability

- [x] Log redaction: never output full key/token/header/tool arguments (`infra/log.js` recursively redacts/omits: authorization/cookie/apiKey/apiToken/encrypted_data/arguments/input etc.)
- [x] Config anti-prototype-pollution: filter unsafe keys (`config/normalize-config.js`)
- [x] Webview minimal permissions: only the local resource root + `enableScripts` (no remote loading)
- [x] Diagnosable errors: key paths carry trace labels (endpoint/provider/model/requestId) and prefer readable error text
- [x] Streaming safety fallback: exceptions are wrapped into renderable error chunks (avoid UI no-output/freezes)

### 15) CI / Release (rolling + incremental review)

- [x] rolling release: pushes to the default branch auto-build and update the `rolling` tag Release
- [x] upstream-check: periodically fetch the latest upstream VSIX; on version change, PR to update `upstream.lock.json`
- [x] Audit entry points: `upstream.lock.json` / `dist/upstream.lock.json` / `dist/endpoint-coverage.report.md`

### 16) To Optimize / Roadmap

- [ ] Deduplication: further converge upstream discovery / util logic (benefit: fewer drift points)
- [ ] Quality gates: add more pure-function unit tests + low-cost "unreferenced / exported-but-unused" cleanup
- [ ] UX (optional): in-panel validation, more concise troubleshooting quick-reference
