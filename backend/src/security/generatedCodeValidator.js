
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";

const MAX_SOURCE_LENGTH = 20_000;

const ALLOWED_IMPORTS = new Set(["react"]);

const BLOCKED_GLOBALS = new Set([
  "window",
  "document",
  "globalThis",
  "self",
  "frames",
  "parent",
  "top",
  "opener",
  "process",
  "global",
  "require",
  "module",
  "exports",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "Worker",
  "SharedWorker",
  "ServiceWorker",
  "importScripts",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "navigator",
  "location",
  "postMessage",
  "alert",
  "prompt",
  "confirm",
  "eval",
  "Function",
  "WebAssembly",
]);

const BLOCKED_CALLS = new Set([
  "eval",
  "Function",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "queueMicrotask",
  "requestAnimationFrame",
  "requestIdleCallback",
]);

const BLOCKED_PROPERTIES = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "caller",
  "callee",
  "arguments",
]);

const BLOCKED_JSX_ATTRIBUTES = new Set([
  "dangerouslySetInnerHTML",
  "ref",
]);

function addIssue(issues, message) {
  issues.push(message);
}

function getPropertyName(node) {
  if (!node) {
    return null;
  }

  if (node.type === "Identifier") {
    return node.name;
  }

  if (
    node.type === "StringLiteral" ||
    node.type === "NumericLiteral"
  ) {
    return String(node.value);
  }

  return null;
}

/**
 * Validates generated JSX/JavaScript syntax and rejects
 * explicitly prohibited imports, globals and operations.
 *
 * This is static validation, not a JavaScript sandbox.
 * Untrusted code must still run in an isolated environment.
 */
export function validateGeneratedCode(source) {
  const issues = [];

  if (typeof source !== "string" || !source.trim()) {
    return {
      valid: false,
      issues: ["Generated source must be a non-empty string."],
    };
  }

  if (source.length > MAX_SOURCE_LENGTH) {
    return {
      valid: false,
      issues: ["Generated source exceeds the maximum allowed size."],
    };
  }

  let ast;

  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: ["jsx"],
      errorRecovery: false,
    });
  } catch (error) {
    return {
      valid: false,
      issues: [
        `Invalid JavaScript/JSX syntax: ${error.message}`,
      ],
    };
  }

  traverse(ast, {
    ImportDeclaration(path) {
      const moduleName = path.node.source.value;

      if (!ALLOWED_IMPORTS.has(moduleName)) {
        addIssue(
          issues,
          `Import from "${moduleName}" is not allowed.`
        );
      }
    },

    ImportExpression() {
      addIssue(
        issues,
        "Dynamic imports are not allowed."
      );
    },

    CallExpression(path) {
      const { callee } = path.node;

      if (
        callee.type === "Identifier" &&
        BLOCKED_CALLS.has(callee.name)
      ) {
        addIssue(
          issues,
          `Call to "${callee.name}" is not allowed.`
        );
      }

      if (callee.type === "Import") {
        addIssue(
          issues,
          "Dynamic imports are not allowed."
        );
      }
    },

    NewExpression(path) {
      const { callee } = path.node;

      if (
        callee.type === "Identifier" &&
        BLOCKED_CALLS.has(callee.name)
      ) {
        addIssue(
          issues,
          `Construction using "${callee.name}" is not allowed.`
        );
      }
    },

    ThisExpression() {
      addIssue(
        issues,
        'Access to "this" is not allowed.'
      );
    },

    Identifier(path) {
      const name = path.node.name;

      if (
        BLOCKED_GLOBALS.has(name) &&
        path.isReferencedIdentifier()
      ) {
        addIssue(
          issues,
          `Access to "${name}" is not allowed.`
        );
      }
    },

    MemberExpression(path) {
      const propertyName = getPropertyName(
        path.node.property
      );

      if (BLOCKED_PROPERTIES.has(propertyName)) {
        addIssue(
          issues,
          `Property access "${propertyName}" is not allowed.`
        );
      }
    },

    OptionalMemberExpression(path) {
      const propertyName = getPropertyName(
        path.node.property
      );

      if (BLOCKED_PROPERTIES.has(propertyName)) {
        addIssue(
          issues,
          `Property access "${propertyName}" is not allowed.`
        );
      }
    },

    JSXAttribute(path) {
      const attributeName = path.node.name;

      if (
        attributeName.type === "JSXIdentifier" &&
        BLOCKED_JSX_ATTRIBUTES.has(attributeName.name)
      ) {
        addIssue(
          issues,
          `JSX attribute "${attributeName.name}" is not allowed.`
        );
      }

      if (
        attributeName.type === "JSXIdentifier" &&
        /^on[A-Z]/.test(attributeName.name)
      ) {
        addIssue(
          issues,
          `Event handler "${attributeName.name}" is not allowed.`
        );
      }
    },

    JSXSpreadAttribute() {
      addIssue(
        issues,
        "JSX spread attributes are not allowed."
      );
    },
  });

  return {
    valid: issues.length === 0,
    issues: [...new Set(issues)],
  };
}
