
"use client";

import { useEffect, useRef, useState } from "react";
import * as Babel from "@babel/standalone";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  "http://localhost:4000";

const DEFAULT_SOURCE = `
import React from "react";

export default function Preview() {
  return (
    <div>
      <h2>AuraGen Dynamic Preview</h2>
      <p>Your JSX component was compiled successfully.</p>
      <button type="button">Preview Button</button>
    </div>
  );
}
`;

const ALLOWED_TAGS = [
  "div", "span", "p", "h1", "h2", "h3", "h4",
  "section", "article", "header", "footer",
  "strong", "em", "small", "ul", "ol", "li",
  "button", "label", "input", "img", "hr", "br",
];

function createSandboxDocument(compiledCode) {
  const safeCode = JSON.stringify(compiledCode)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta
  http-equiv="Content-Security-Policy"
  content="
    default-src 'none';
    script-src 'unsafe-inline' 'unsafe-eval';
    style-src 'unsafe-inline';
    img-src data: blob:;
    connect-src 'none';
    form-action 'none';
    frame-src 'none';
    object-src 'none';
    base-uri 'none';
  "
>
<style>
  body {
    font-family: Arial, sans-serif;
    padding: 20px;
    color: #202938;
    background: #ffffff;
  }

  button {
    padding: 9px 15px;
    border: 0;
    border-radius: 6px;
    background: #2563eb;
    color: white;
  }

  .preview-error {
    color: #b91c1c;
    white-space: pre-wrap;
  }
</style>
</head>
<body>
<div id="preview-root"></div>

<script>
(function () {
  "use strict";

  const compiledCode = ${safeCode};
  const root = document.getElementById("preview-root");

  const React = {
    Fragment: Symbol("Fragment"),

    createElement(type, props, ...children) {
      const nextProps = { ...(props || {}) };

      if (children.length === 1) {
        nextProps.children = children[0];
      } else if (children.length > 1) {
        nextProps.children = children;
      }

      return {
        type,
        props: nextProps,
      };
    },
  };

  const jsxRuntime = {
    Fragment: React.Fragment,

    jsx(type, props, key) {
      const nextProps = { ...(props || {}) };

      if (key !== undefined) {
        nextProps.key = key;
      }

      return React.createElement(type, nextProps);
    },

    jsxs(type, props, key) {
      const nextProps = { ...(props || {}) };

      if (key !== undefined) {
        nextProps.key = key;
      }

      return React.createElement(type, nextProps);
    },
  };

  function renderNode(node, parent) {
    if (
      node === null ||
      node === undefined ||
      typeof node === "boolean"
    ) {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((child) => renderNode(child, parent));
      return;
    }

    if (
      typeof node === "string" ||
      typeof node === "number"
    ) {
      parent.appendChild(
        document.createTextNode(String(node))
      );
      return;
    }

    if (!node || typeof node !== "object") {
      return;
    }

    if (node.type === React.Fragment) {
      renderNode(node.props.children, parent);
      return;
    }

    if (typeof node.type === "function") {
      const result = node.type(node.props || {});
      renderNode(result, parent);
      return;
    }

    if (
      typeof node.type !== "string" ||
      !${JSON.stringify(ALLOWED_TAGS)}.includes(node.type)
    ) {
      throw new Error("Unsupported preview element.");
    }

    const element = document.createElement(node.type);
    const props = node.props || {};

    for (const [name, value] of Object.entries(props)) {
      if (
        name === "children" ||
        name === "key" ||
        name === "ref" ||
        name === "dangerouslySetInnerHTML" ||
        /^on/i.test(name)
      ) {
        continue;
      }

      if (
        name === "style" &&
        value &&
        typeof value === "object"
      ) {
        for (const [property, styleValue] of Object.entries(value)) {
          if (
            typeof styleValue === "string" ||
            typeof styleValue === "number"
          ) {
            const safeValue = String(styleValue);

            if (
              !/url\\s*\\(|expression\\s*\\(|@import/i.test(safeValue)
            ) {
              element.style[property] = safeValue;
            }
          }
        }

        continue;
      }

      const allowed =
        name === "className" ||
        name === "id" ||
        name === "title" ||
        name === "role" ||
        name === "type" ||
        name === "placeholder" ||
        name === "value" ||
        name === "alt" ||
        name === "src" ||
        name.startsWith("aria-") ||
        name.startsWith("data-");

      if (
        !allowed ||
        typeof value === "object" ||
        value === null
      ) {
        continue;
      }

      if (
        name === "src" &&
        !/^data:image\\//i.test(String(value)) &&
        !/^blob:/i.test(String(value))
      ) {
        continue;
      }

      const attributeName =
        name === "className" ? "class" : name;

      element.setAttribute(attributeName, String(value));
    }

    parent.appendChild(element);
    renderNode(props.children, element);
  }

  try {
    const module = { exports: {} };

    function requireModule(name) {
      if (name === "react") {
        return React;
      }

      if (name === "react/jsx-runtime") {
        return jsxRuntime;
      }

      if (name === "react/jsx-dev-runtime") {
        return jsxRuntime;
      }

      throw new Error(
        "Module is not available in preview: " + name
      );
    }

    const execute = new Function(
      "React",
      "module",
      "exports",
      "require",
      compiledCode
    );

    execute(
      React,
      module,
      module.exports,
      requireModule
    );

    const Component =
      module.exports.default || module.exports;

    if (typeof Component !== "function") {
      throw new Error(
        "Generated source must export a default React component."
      );
    }

    renderNode(
      React.createElement(Component, null),
      root
    );
  } catch (error) {
    const message = document.createElement("pre");
    message.className = "preview-error";
    message.textContent =
      error.message || "Preview rendering failed.";

    root.replaceChildren(message);
  }
})();
</script>
</body>
</html>`;
}

export default function GeneratedCodePreview({
  initialSource = DEFAULT_SOURCE,
}) {
  const [source, setSource] = useState(initialSource);
  const [previewDocument, setPreviewDocument] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Not compiled");
  const [isValidating, setIsValidating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Track the active backend request.
  const activeControllerRef = useRef(null);

  // Prevent state updates after component unmount.
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      activeControllerRef.current?.abort();
      activeControllerRef.current = null;
    };
  }, []);

  // STEP 1: Validate and compile generated JSX.
  async function compileAndPreview(
    sourceToCompile = source,
    options = {}
  ) {
    if (isValidating) {
      return false;
    }

    const externalSignal = options.signal;

    // Manual validation owns its controller.
    // AI generation supplies its existing controller signal.
    const controller = externalSignal
      ? null
      : new AbortController();

    const requestSignal =
      externalSignal || controller.signal;

    if (controller) {
      activeControllerRef.current = controller;
    }

    if (requestSignal.aborted || !isMountedRef.current) {
      if (
        controller &&
        activeControllerRef.current === controller
      ) {
        activeControllerRef.current = null;
      }

      return false;
    }

    setError("");
    setPreviewDocument("");
    setIsValidating(true);
    setStatus("Validating generated code with backend...");

    try {
      if (!sourceToCompile.trim()) {
        throw new Error("Generated source cannot be empty.");
      }

      if (sourceToCompile.length > 20000) {
        throw new Error(
          "Generated source exceeds 20,000 characters."
        );
      }

      const response = await fetch(
        `${API_URL}/api/generated-code/validate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            source: sourceToCompile,
          }),
          signal: requestSignal,
        }
      );

      if (requestSignal.aborted || !isMountedRef.current) {
        return false;
      }

      const validationResult = await response.json();

      if (requestSignal.aborted || !isMountedRef.current) {
        return false;
      }

      if (!response.ok || validationResult.valid !== true) {
        const issues = Array.isArray(validationResult.issues)
          ? validationResult.issues
              .map((issue) =>
                typeof issue === "string"
                  ? issue
                  : issue.message || JSON.stringify(issue)
              )
              .join("\n")
          : "";

        throw new Error(
          issues ||
            validationResult.message ||
            "Backend security validation rejected the generated code."
        );
      }

      setStatus(
        "Backend validation successful. Compiling JSX..."
      );

      const result = Babel.transform(sourceToCompile, {
        filename: "GeneratedPreview.jsx",
        sourceType: "module",
        presets: [
          ["env", { modules: "commonjs" }],
          ["react", { runtime: "classic" }],
        ],
      });

      if (requestSignal.aborted || !isMountedRef.current) {
        return false;
      }

      if (!result.code) {
        throw new Error("Babel did not produce compiled code.");
      }

      setPreviewDocument(
        createSandboxDocument(result.code)
      );

      setStatus(
        "Backend validation successful. Compilation successful."
      );

      return true;
    } catch (compileError) {
      if (
        requestSignal.aborted ||
        compileError.name === "AbortError" ||
        !isMountedRef.current
      ) {
        return false;
      }

      setPreviewDocument("");

      setError(
        compileError.message ||
          "Generated code validation or compilation failed."
      );

      setStatus("Validation / compilation failed");

      return false;
    } finally {
      if (controller) {
        if (activeControllerRef.current === controller) {
          activeControllerRef.current = null;
        }
      }

      if (isMountedRef.current) {
        setIsValidating(false);
      }
    }
  }

  // STEP 2: Stream JSX tokens from the backend.
  async function generateWithAI() {
    if (isGenerating || isValidating) {
      return;
    }

    const previousSource = source;

    const controller = new AbortController();

    activeControllerRef.current = controller;

    let generatedSource = "";
    let buffer = "";
    let completionEvent = null;
    let reader = null;

    setIsGenerating(true);
    setError("");
    setStatus("Connecting to AuraGen AI...");

    try {
      const response = await fetch(
        `${API_URL}/api/generated-code/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/x-ndjson",
          },
          body: JSON.stringify({}),
          signal: controller.signal,
        }
      );

      if (controller.signal.aborted || !isMountedRef.current) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          `AI generation request failed (HTTP ${response.status}).`
        );
      }

      if (!response.body) {
        throw new Error(
          "Streaming response is not supported by this browser."
        );
      }

      reader = response.body.getReader();

      const decoder = new TextDecoder();

      setStatus("Receiving JSX tokens from Ollama...");

      // Process one complete NDJSON event.
      function processEventLine(line) {
        const trimmedLine = line.trim();

        if (!trimmedLine) {
          return;
        }

        let event;

        try {
          event = JSON.parse(trimmedLine);
        } catch {
          throw new Error(
            "The backend returned an invalid streaming event."
          );
        }

        if (event.type === "token") {
          if (typeof event.token !== "string") {
            throw new Error(
              "The backend returned an invalid JSX token."
            );
          }

          generatedSource += event.token;

          if (generatedSource.length > 20000) {
            throw new Error(
              "Generated source exceeds 20,000 characters."
            );
          }

          // Display incoming source progressively.
          if (
            isMountedRef.current &&
            !controller.signal.aborted
          ) {
            setSource(generatedSource);
          }

          return;
        }

        if (event.type === "complete") {
          completionEvent = event;
          return;
        }

        if (event.type === "error") {
          throw new Error(
            event.message || "AI generation failed on the backend."
          );
        }
      }

      // Read the stream until the server closes it.
      while (true) {
        if (
          controller.signal.aborted ||
          !isMountedRef.current
        ) {
          return;
        }

        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        if (
          controller.signal.aborted ||
          !isMountedRef.current
        ) {
          return;
        }

        buffer += decoder.decode(value, {
          stream: true,
        });

        const lines = buffer.split("\n");

        // Keep the unfinished line for the next chunk.
        buffer = lines.pop() || "";

        for (const line of lines) {
          processEventLine(line);
        }
      }

      // Flush the decoder and process the last event.
      buffer += decoder.decode();

      if (buffer.trim()) {
        processEventLine(buffer);
      }

      if (
        controller.signal.aborted ||
        !isMountedRef.current
      ) {
        return;
      }

      if (!completionEvent) {
        throw new Error(
          "AI generation ended without a completion event."
        );
      }

      if (completionEvent.valid !== true) {
        const issues = Array.isArray(completionEvent.issues)
          ? completionEvent.issues
              .map((issue) =>
                typeof issue === "string"
                  ? issue
                  : issue.message || JSON.stringify(issue)
              )
              .join("\n")
          : "";

        throw new Error(
          issues ||
            "The backend rejected the generated JSX."
        );
      }

      if (!generatedSource.trim()) {
        throw new Error(
          "Ollama completed generation without returning JSX."
        );
      }

      setStatus(
        "AI generation complete. Starting security validation..."
      );

      // STEP 3: Validate, compile and preview the complete source.
      const previewSuccessful =
        await compileAndPreview(generatedSource, {
          signal: controller.signal,
        });

      if (
        controller.signal.aborted ||
        !isMountedRef.current
      ) {
        return;
      }

      if (!previewSuccessful) {
        throw new Error(
          "Generated JSX could not pass validation or compilation."
        );
      }
    } catch (generationError) {
      // Ignore intentional cancellation and unmounted components.
      if (
        controller.signal.aborted ||
        generationError.name === "AbortError" ||
        !isMountedRef.current
      ) {
        return;
      }

      // Restore the editor if generation fails.
      setSource(previousSource);

      setError(
        generationError.message ||
          "Unable to generate the component."
      );

      setStatus("AI generation failed");
    } finally {
      if (reader) {
        try {
          reader.releaseLock();
        } catch {
          // The stream may already have released its reader.
        }
      }

      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
      }

      if (isMountedRef.current) {
        setIsGenerating(false);
      }
    }
  }

  // STEP 4: User interface.
  return (
    <section
      style={{
        border: "1px solid #d1d5db",
        borderRadius: "10px",
        padding: "18px",
        margin: "16px 0",
        background: "#ffffff",
      }}
    >
      <h2>AuraGen Dynamic Code Preview</h2>

      <p>
        Generate JSX with Ollama, stream it into the editor,
        validate it through the AuraGen backend, and compile
        it before displaying the preview.
      </p>

      <textarea
        value={source}
        onChange={(event) => setSource(event.target.value)}
        spellCheck={false}
        aria-label="Generated JSX source"
        style={{
          width: "100%",
          minHeight: "220px",
          padding: "12px",
          border: "1px solid #9ca3af",
          borderRadius: "6px",
          fontFamily: "monospace",
          fontSize: "13px",
          resize: "vertical",
        }}
      />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          marginTop: "12px",
        }}
      >
        <button
          type="button"
          onClick={generateWithAI}
          disabled={isGenerating || isValidating}
          style={{
            padding: "10px 16px",
            border: "none",
            borderRadius: "6px",
            background:
              isGenerating || isValidating
                ? "#9ca3af"
                : "#059669",
            color: "#ffffff",
            cursor:
              isGenerating || isValidating
                ? "not-allowed"
                : "pointer",
          }}
        >
          {isGenerating
            ? "Generating..."
            : "Generate with AI"}
        </button>

        <button
          type="button"
          onClick={() => compileAndPreview()}
          disabled={isGenerating || isValidating}
          style={{
            padding: "10px 16px",
            border: "none",
            borderRadius: "6px",
            background:
              isGenerating || isValidating
                ? "#9ca3af"
                : "#2563eb",
            color: "#ffffff",
            cursor:
              isGenerating || isValidating
                ? "not-allowed"
                : "pointer",
          }}
        >
          {isValidating
            ? "Validating..."
            : "Validate, Compile and Preview"}
        </button>
      </div>

      <p role="status" aria-live="polite">
        {status}
      </p>

      {error && (
        <pre
          role="alert"
          style={{
            color: "#b91c1c",
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </pre>
      )}

      <h3>Component Preview</h3>

      {previewDocument ? (
        <iframe
          title="AuraGen generated component preview"
          sandbox="allow-scripts"
          srcDoc={previewDocument}
          style={{
            width: "100%",
            minHeight: "300px",
            border: "1px solid #9ca3af",
            borderRadius: "6px",
            background: "#ffffff",
          }}
        />
      ) : (
        <p>
          Backend validation and compilation are required
          before displaying the preview.
        </p>
      )}
    </section>
  );
}
