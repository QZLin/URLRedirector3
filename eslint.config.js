import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "tools/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions },
    },
  },
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node, ...globals.webextensions },
    },
  },
  {
    files: ["**/*.mjs", "*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
