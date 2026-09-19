import base from "@zelo/config/eslint.base";
import reactHooks from "eslint-plugin-react-hooks";

const RAW_HTML_MESSAGE =
  "Raw HTML rendering is banned in apps/web: manager, admin and peer-partner session tokens sit in sessionStorage, so one injected script exfiltrates a session (docs/superpowers/specs/technical-debt.md, TD-001). Render text through React instead.";

export default [
  ...base,
  {
    files: ["**/*.{ts,tsx}"],
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { setTimeout: "readonly", setInterval: "readonly", setImmediate: "readonly" },
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: RAW_HTML_MESSAGE },
        { selector: "Property[key.name='dangerouslySetInnerHTML']", message: RAW_HTML_MESSAGE },
        {
          selector: "AssignmentExpression[left.type='MemberExpression'][left.property.name=/^(innerHTML|outerHTML)$/]",
          message: RAW_HTML_MESSAGE,
        },
        {
          selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='insertAdjacentHTML']",
          message: RAW_HTML_MESSAGE,
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.name='document'][callee.property.name=/^(write|writeln)$/]",
          message: RAW_HTML_MESSAGE,
        },
      ],
    },
  },
];
