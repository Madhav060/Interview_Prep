// eslint.config.js
import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react/configs/recommended.js";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginReactRefresh from "eslint-plugin-react-refresh";

export default [
  // 1. Apply recommended rules
  pluginJs.configs.recommended,
  pluginReact,
  pluginReactHooks.configs.recommended,

  // 2. Config for React Refresh
  {
    plugins: {
      'react-refresh': pluginReactRefresh,
    },
    rules: {
      'react-refresh/only-export-components': 'warn',
    },
  },

  // 3. General Settings
  {
    files: ["**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}"], // Apply to all JS/React files
    languageOptions: {
      globals: {
        ...globals.browser, // Enable browser globals (window, document, etc.)
        ...globals.node     // Enable Node.js globals (process, etc.)
      },
      parserOptions: {
        ecmaFeatures: { jsx: true }, // Enable JSX parsing
      },
    },
    settings: {
      react: { version: "detect" }, // Automatically detect React version
    },
    rules: {
      "react/react-in-jsx-scope": "off", // Not needed with React 17+
      "react/prop-types": "off" // Disable if you are not using prop-types
    }
  }
];
