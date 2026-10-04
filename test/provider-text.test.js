const test = require("node:test");
const assert = require("node:assert/strict");

const {
  asOpenAiMessages,
  asAnthropicMessages,
  asGeminiContents,
  asOpenAiResponsesInput,
  completeTextByProviderType,
  streamTextDeltasByProviderType
} = require("../payload/extension/out/byok/core/provider-text");

test("provider-text: asOpenAiMessages prepends system and drops empty content", () => {
  const out = asOpenAiMessages("sys", [
    { role: "user", content: "hi" },
    { role: "assistant", content: "" },
    { role: "user", content: null }
  ]);
  assert.deepEqual(out, [
    { role: "system", content: "sys" },
    { role: "user", content: "hi" }
  ]);
});

test("provider-text: asAnthropicMessages keeps user/assistant only", () => {
  const out = asAnthropicMessages(" sys ", [
    { role: "system", content: "ignored" },
    { role: "user", content: "hi" },
    { role: "assistant", content: "ok" },
    { role: "tool", content: "ignored" }
  ]);
  assert.deepEqual(out, {
    system: "sys",
    messages: [
      { role: "user", content: "hi" },
      { role: "assistant", content: "ok" }
    ]
  });
});

test("provider-text: asGeminiContents maps assistant->model and drops unknown roles", () => {
  const out = asGeminiContents("sys", [
    { role: "assistant", content: "a" },
    { role: "user", content: "u" },
    { role: "system", content: "ignored" }
  ]);
  assert.deepEqual(out, {
    systemInstruction: "sys",
    contents: [
      { role: "model", parts: [{ text: "a" }] },
      { role: "user", parts: [{ text: "u" }] }
    ]
  });
});

test("provider-text: asOpenAiResponsesInput maps roles and uses instructions", () => {
  const out = asOpenAiResponsesInput("sys", [
    { role: "assistant", content: "a" },
    { role: "user", content: "u" },
    { role: "system", content: "ignored" }
  ]);
  assert.deepEqual(out, {
    instructions: "sys",
    input: [
      { type: "message", role: "assistant", content: "a" },
      { type: "message", role: "user", content: "u" }
    ]
  });
});

test("provider-text: unknown provider.type throws without network", async () => {
  await assert.rejects(
    async () => {
      await completeTextByProviderType({ type: "unknown", baseUrl: "x", apiKey: "y", model: "z", system: "", messages: [] });
    },
    (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      return msg.includes("Unknown provider.type") && msg.includes("openai_compatible") && msg.includes("gemini_ai_studio");
    }
  );

  const gen = streamTextDeltasByProviderType({ type: "unknown", baseUrl: "x", apiKey: "y", model: "z", system: "", messages: [] });
  await assert.rejects(async () => {
    // consume one step to trigger the error
    // eslint-disable-next-line no-unused-vars
    for await (const _ of gen) break;
  });
});

