# 选择文字 → "Open in Chat" / "Send to Augment" 实现分析

> 分析日期：2026-07-18
> 基于 Augment VS Code 扩展 v0.890.3 + Augment-BYOK

---

## 1. 概述

当用户在编辑器中选择一段文本，右键菜单出现 **"Send to Augment"** 子菜单，其中有多个命令（Explain / Test / Fix / Document 等），点击后选中的代码会被发送到 Augment Chat 面板作为 AI 对话的上下文。

本文档完整追溯从 **右键菜单注册 → 选中文本提取 → 消息传递 → Chat 面板消费 → BYOK 请求处理** 的全链路实现。

---

## 2. 菜单注册（`package.json`）

### 2.1 子菜单定义

```json
"submenus": [
  {
    "id": "vscode-augment.context-submenu",
    "label": "Send to Augment"
  }
]
```

定义了一个名为 `"Send to Augment"` 的子菜单，该 ID 会被后续菜单项引用。

### 2.2 右键菜单注入

```json
"menus": {
  "editor/context": [
    {
      "submenu": "vscode-augment.context-submenu",
      "group": "0_augment"
    }
  ],
  "vscode-augment.context-submenu": [
    { "command": "vscode-augment.focusAugmentPanel" },
    { "command": "vscode-augment.chat.slash.explain" },
    { "command": "vscode-augment.chat.slash.test" },
    { "command": "vscode-augment.chat.slash.fix" },
    { "command": "vscode-augment.chat.slash.document" }
  ]
}
```

- `"editor/context"` 是 VS Code 的编辑器右键菜单贡献点。
- `group: "0_augment"` 控制菜单项在右键菜单中的排序位置（`0_` 优先级最高，出现在菜单靠前位置）。
- 子菜单包含 5 个命令：直接打开 Chat 面板、Explain、Test、Fix、Document。

### 2.3 终端右键菜单

```json
"terminal/context": [
  {
    "command": "vscode-augment.addTerminalOutputToChat",
    "group": "navigation",
    "when": "terminalTextSelected"
  }
]
```

终端中选中文本后也会出现 "Add Selection to Augment Chat" 菜单项。

### 2.4 命令列表

相关命令（来自 `contributes.commands`）：

| 命令 | 显示标题 |
|------|---------|
| `vscode-augment.focusAugmentPanel` | Open Augment |
| `vscode-augment.chat.slash.explain` | Explain using Augment |
| `vscode-augment.chat.slash.test` | Write test using Augment |
| `vscode-augment.chat.slash.fix` | Fix using Augment |
| `vscode-augment.chat.slash.document` | Document using Augment |
| `vscode-augment.addTerminalOutputToChat` | Add Selection to Augment Chat |

---

## 3. 选中文本提取核心逻辑

当命令被触发，处理器会调用 **`getSelectedCodeDetails`** 函数（编译后名称为 `NFr`/`bft`，位于 `out/extension.js`）。

### 3.1 函数签名与参数

```typescript
function getSelectedCodeDetails(
  editor: TextEditor,
  prefixSuffixMaxChars: number = 500,
  maxSelectedCodeLength: number = 65000
): SelectedCodeDetails | null
```

### 3.2 实现流程

```
获取 activeTextEditor
    │
    ▼
获取 selection 范围
    │
    ▼
document.getText(selection) → selectedCode
    │
    ├── 如果 > 65KB：截断到 65KB
    │
    ▼
提取 prefix（选中文本之前的内容）
    ├── new Range(document起始, selection.start)
    ├── 如果 > 500 字符：保留末尾 500 字符
    │
    ▼
提取 suffix（选中文本之后的内容）
    ├── new Range(selection.end, document末尾)
    ├── 如果 > 500 字符：保留开头 500 字符
    │
    ▼
返回 {
  selectedCode,   // 选中的代码片段
  prefix,         // 选中代码之前的文本（上下文）
  suffix,         // 选中代码之后的文本（上下文）
  path,           // 文件相对路径
  language        // 语言 ID
}
```

### 3.3 边界处理

1. **空选择**：如果 `selectedCode.trim() === ""`，则不会发送到 Chat
2. **超大文件**：选中文本超过 65KB 时自动截断
3. **前缀/后缀溢出**：prefix 和 suffix 各自最多保留 500 字符
4. **换行处理**：如果 suffix 以换行开头且没有其他内容，会被吞并到 selectedCode 中
5. **路径解析**：通过 `safeResolvePathName(uri)` 获取相对于 workspace 的路径

---

## 4. 消息传递（Webview 通信）

选中文本提取完成后，通过 VS Code 的 Webview 消息机制发送到 Chat 面板。

### 4.1 消息协议

```typescript
// 对于 slash 命令（explain/test/fix/document）
{
  type: "run-slash-command",    // $e.runSlashCommand
  payload: {
    slash: "explain",           // 或 test/fix/document
    selectedCode: "...",
    prefix: "...",
    suffix: "...",
    path: "src/main.ts",
    language: "typescript"
  }
}

// 对于终端输出
{
  type: "add-terminal-output-to-chat",  // $e.addTerminalOutputToChat
  payload: {
    terminalContent: "..."
  }
}

// 对于 "Add File to Chat" / "Add Folder to Chat"
{
  type: "add-file-to-chat",     // $e.addFileToChat
  payload: { uri: "..." }
}
```

### 4.2 消息处理器

使用 `AsyncMsgHandler`（`SFr` 类）包装所有异步消息处理：

```typescript
class AsyncMsgHandler {
  createWrappedHandler(type, handler) {
    return (msg) => {
      if (msg.type !== "async-wrapper" || msg.baseMsg?.type !== type) return false;
      // 执行 handler，通过 postMessage 返回结果
    };
  }
}
```

---

## 5. Chat 面板侧消费

### 5.1 Slash 命令组装

Chat 面板（Webview 端 React 应用）收到 `run-slash-command` 后：

1. 将 `selectedCode` 嵌入到 Chat 输入框
2. 根据 slash 命令类型设置预设 prompt：
   - `/explain` → "Explain the following code..."
   - `/test` → "Write tests for the following code..."
   - `/fix` → "Fix the following code..."
   - `/document` → "Document the following code..."
3. 用户可编辑后发送，或直接发送

### 5.2 请求体中的字段

当请求到达 BYOK 层时，body 中包含以下字段：

```json
{
  "message": "/explain Explain the following code: ...",
  "selected_code": "function foo() { ... }",
  "prefix": "import { ... }\n",
  "suffix": "\nexport default ...",
  "lang": "typescript",
  "path": "src/main.ts",
  "mode": "ask",
  "conversation_id": "..."
}
```

---

## 6. BYOK 请求处理

### 6.1 字段规范化

在 `payload/extension/out/byok/core/augment-chat/shared/request.js` 的 `normalizeAugmentChatRequest()` 中，`selected_code` 字段从多个可能名称中归一化：

```javascript
const selected_code = asString(pick(b, [
  "selected_code",
  "selectedCode",
  "selected_text",
  "selectedText",
  "selected_code_snippet",
  "selectedCodeSnippet"
]));

const disable_selected_code_details = Boolean(pick(b, [
  "disable_selected_code_details",
  "disableSelectedCodeDetails"
]));
```

### 6.2 构建内联代码上下文

```javascript
function buildInlineCodeContextText(req) {
  if (req?.disable_selected_code_details === true) return "";
  const prefix = req?.prefix || "";
  const selected = req?.selected_code || "";
  const suffix = req?.suffix || "";
  return `${prefix}${selected}${suffix}`.trim();
}
```

三部分被拼接成一段连续文本，作为内联代码上下文注入到 AI 的 system prompt 中。当 `disable_selected_code_details` 为 `true` 时跳过这一步。

### 6.3 Chat 请求构建

在 `buildByokAugmentChatContext()`（`runtime/shim/augment-chat/index.js`）中：

1. 调用 `normalizeAugmentChatRequest(body)` 归一化请求
2. 调用 `maybeBuildDelegatedAugmentChatRequest()` 从官方上游获取组装好的请求
3. 再次调用 `normalizeAugmentChatRequest(delegated.req)` 归一化委托结果
4. 执行历史摘要、官方上下文注入、工作区文件分块等
5. 最终将请求发送到 LLM Provider（通过 BYOK 路由）

---

## 7. 完整数据流图

```mermaid
flowchart TD
    A[用户选择文本] --> B[右键菜单 → Send to Augment]
    B --> C{选择命令}
    C --> D1[focusAugmentPanel]
    C --> D2[Explain / Test / Fix / Document]
    C --> D3[Add Terminal Output to Chat]

    D1 --> E1[打开侧边栏 Chat Panel]
    D2 --> E2[触发 slash 命令]
    D3 --> E3[获取终端选中文本]

    E2 --> F[getSelectedCodeDetails]
    F --> G[提取 selectedCode<br/>prefix 500 chars<br/>suffix 500 chars<br/>path + language]

    G --> H[Webview postMessage<br/>(run-slash-command)]
    H --> I[Chat Panel 接收<br/>嵌入输入框 + 设置 slash prompt]

    I --> J[用户发送 → AI 请求]
    J --> K[BYOK normalizeAugmentChatRequest<br/>selected_code 归一化]
    K --> L[buildInlineCodeContextText<br/>prefix + selected + suffix]
    L --> M[buildByokAugmentChatContext<br/>上下文组装]
    M --> N[LLM Provider<br/>(OpenAI / Anthropic / Gemini ...)]
```

---

## 8. 相关配置控制

| 配置项 | 类型 | 作用 |
|--------|------|------|
| `augment.disableFocusOnAugmentPanel` | boolean | 关闭自动聚焦 Chat 面板 |
| `augment.chat.userGuidelines` | string | 用户自定义 guidelines，也进入 chat 请求 |

在 BYOK 侧无额外配置影响该行为。

---

## 9. 关键源码位置

| 组件 | 文件路径 |
|------|---------|
| 菜单声明 | `.cache/work/manual-unpack/extension/package.json` → `contributes.menus` |
| 选中文本提取 | 编译到 `out/extension.js` → `getSelectedCodeDetails` (`NFr`/`bft`) |
| Webview 消息协议 | 编译到 `out/extension.js` → `$e.runSlashCommand` etc. |
| selected_code 规范化 | `payload/extension/out/byok/core/augment-chat/shared/request.js` |
| 内联代码上下文构建 | 同上文件 → `buildInlineCodeContextText()` |
| Chat 上下文组装 | `payload/extension/out/byok/runtime/shim/augment-chat/index.js` |
| 非流式 Chat 执行 | `payload/extension/out/byok/runtime/shim/byok-chat/index.js` |
| 流式 Chat 执行 | `payload/extension/out/byok/runtime/shim/byok-chat-stream/index.js` |

---

## 10. 总结

"选择文字 → Open in Chat" 的实现遵循标准的 VS Code 扩展模式：

1. **`package.json` 声明**：`editor/context` 菜单 + `submenus` + `commands`
2. **选中文本提取**：纯 VS Code API 操作（`TextEditor.selection` + `document.getText()`）
3. **Webview 通信**：通过 `postMessage` 将选中代码 + slash 参数传给 Chat 面板
4. **Chat 面板消费**：React 端处理 slash 命令，将代码嵌入输入框
5. **AI 请求**：经过官方上游组装 → BYOK 规范化 → 路由到配置的 LLM Provider

BYOK 层在此流程中不干涉前两步（菜单注册和文本提取），仅在请求到达后端时对 `selected_code`/`prefix`/`suffix` 字段进行规范化处理，并控制是否将这些细节注入到 AI 的上下文中。
