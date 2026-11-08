import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  // public/ holds plain browser files (the tiny theme-init.js script), not application code.
  globalIgnores([".next/**", "node_modules/**", "coverage/**", "next-env.d.ts", "public/**"]),
  {
    // The mock server and the test helpers run in plain Node, not in the browser.
    files: ["mock-api/**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        Buffer: "readonly",
        TextDecoder: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
  },
]);
