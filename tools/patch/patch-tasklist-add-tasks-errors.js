#!/usr/bin/env node
"use strict";

const path = require("path");

const { replaceOnceRegex } = require("../lib/patch");
const { loadPatchText, savePatchText } = require("./patch-target");
const { requireCapture, buildTaskFailuresSummarySnippet } = require("./tasklist-common");

const MARKER = "__augment_byok_tasklist_add_tasks_errors_patched_v1";

function buildReplacement(m) {
  const label = "tasklist add_tasks errors current";
  const convVar = requireCapture(m, 1, `${label} convVar`);
  const tasksVar = requireCapture(m, 2, `${label} tasksVar`);
  const prefix = requireCapture(m, 3, `${label} prefix`);
  const resultsVar = requireCapture(m, 4, `${label} resultsVar`);
  const loopAndMiddle = requireCapture(m, 5, `${label} loopAndMiddle`);
  const planVar = requireCapture(m, 6, `${label} planVar`);
  const rootVar = requireCapture(m, 7, `${label} rootVar`);
  const okFnVar = requireCapture(m, 8, `${label} okFnVar`);
  const formatterVar = requireCapture(m, 9, `${label} formatterVar`);
  const diffFnVar = requireCapture(m, 10, `${label} diffFnVar`);
  const beforeVar = requireCapture(m, 11, `${label} beforeVar`);
  const errFnVar = requireCapture(m, 12, `${label} errFnVar`);
  const textVar = "__byok_add_tasks_text";
  const insertion = buildTaskFailuresSummarySnippet({ resultsVar, errorFnVar: errFnVar, textVar, planVar });
  return (
    `async handleBatchCreation(${convVar},${tasksVar}){${prefix}const ${resultsVar}=[];${loopAndMiddle}` +
    `const ${planVar}=await this._taskManager.getHydratedTask(${rootVar});` +
    `if(!${planVar})return ${errFnVar}("Failed to retrieve updated task tree.");` +
    `let ${textVar}=${formatterVar}.formatBulkUpdateResponse(${diffFnVar}(${beforeVar},${planVar}));` +
    `${insertion}return{...${okFnVar}(${textVar}),plan:${planVar}}`
  );
}

function buildReplacementIfReturn(m) {
  const label = "tasklist add_tasks errors if-return";
  const convVar = requireCapture(m, 1, `${label} convVar`);
  const tasksVar = requireCapture(m, 2, `${label} tasksVar`);
  const prefix = requireCapture(m, 3, `${label} prefix`);
  const resultsVar = requireCapture(m, 4, `${label} resultsVar`);
  const loopAndMiddle = requireCapture(m, 5, `${label} loopAndMiddle`);
  const planVar = requireCapture(m, 6, `${label} planVar`);
  const rootVar = requireCapture(m, 7, `${label} rootVar`);
  const errFnVar = requireCapture(m, 8, `${label} errFnVar`);
  const errArgs = requireCapture(m, 9, `${label} errArgs`);
  const formatterVar = requireCapture(m, 11, `${label} formatterVar`);
  const diffFnVar = requireCapture(m, 12, `${label} diffFnVar`);
  const beforeVar = requireCapture(m, 13, `${label} beforeVar`);
  const okFnVar = requireCapture(m, 14, `${label} okFnVar`);
  const textVar = "__byok_add_tasks_text";
  const insertion = buildTaskFailuresSummarySnippet({ resultsVar, errorFnVar: errFnVar, textVar, planVar });
  return (
    `async handleBatchCreation(${convVar},${tasksVar}){${prefix}const ${resultsVar}=[];${loopAndMiddle}` +
    `const ${planVar}=await this._taskManager.getHydratedTask(${rootVar});` +
    `if(!${planVar})return ${errFnVar}(${errArgs});` +
    `let ${textVar}=${formatterVar}.formatBulkUpdateResponse(${diffFnVar}(${beforeVar},${planVar}));` +
    `${insertion}return{...${okFnVar}(${textVar}),plan:${planVar}}`
  );
}

function patchTasklistAddTasksErrors(filePath) {
  const { original, alreadyPatched } = loadPatchText(filePath, { marker: MARKER });
  if (alreadyPatched) return { changed: false, reason: "already_patched" };

  let next = original;

  // Upstream add_tasks swallows per-task creation errors inside handleBatchCreation and returns
  // "Created: 0, Updated: 0, Deleted: 0" with no error details.
  // Patch: if any tasks fail, append failure summary; if all fail, return isError=true with details.
  const ternaryShape = /async handleBatchCreation\(([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*)\)\{([\s\S]*?)(?:let|const)\s+([A-Za-z_$][\w$]*)=\[\];([\s\S]*?)(?:let|const)\s+([A-Za-z_$][\w$]*)=await this\._taskManager\.getHydratedTask\(([A-Za-z_$][\w$]*)\);return\s+\6\?\{\.\.\.([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\.formatBulkUpdateResponse\(([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*),\6\)\)\),plan:\6\}:([A-Za-z_$][\w$]*)\("Failed to retrieve updated task tree\."\)/g;
  const ifReturnShape = /async handleBatchCreation\(([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*)\)\{([\s\S]*?)(?:let|const)\s+([A-Za-z_$][\w$]*)=\[\];([\s\S]*?)(?:let|const)\s+([A-Za-z_$][\w$]*)=await this\._taskManager\.getHydratedTask\(([A-Za-z_$][\w$]*)\);if\(!\6\)return\s+([A-Za-z_$][\w$]*)\(([^;]+)\);(?:let|const)\s+([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\.formatBulkUpdateResponse\(([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*),\6\)\);return\{\.\.\.([A-Za-z_$][\w$]*)\(\10\),plan:\6\}/g;

  let matched = false;
  try {
    next = replaceOnceRegex(next, ternaryShape, buildReplacement, "tasklist add_tasks errors: handleBatchCreation");
    matched = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("needle not found")) throw err;
  }
  if (!matched) {
    next = replaceOnceRegex(next, ifReturnShape, buildReplacementIfReturn, "tasklist add_tasks errors: handleBatchCreation");
  }

  savePatchText(filePath, next, { marker: MARKER });
  return { changed: true, reason: "patched" };
}

module.exports = { patchTasklistAddTasksErrors };

if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error(`usage: ${path.basename(process.argv[1])} <extension/out/extension.js>`);
    process.exit(2);
  }
  patchTasklistAddTasksErrors(filePath);
}
