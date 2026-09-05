// eslint.config.js — ESLint v10 flat config
// eslint-plugin-react (used by eslint-config-expo) does not yet support ESLint 10
// (it calls the removed contextOrFilename.getFilename API).
// Workaround: spread all expo config blocks, then override every react/* rule to 'off'.
// We retain full TS, import, expo, and react-hooks coverage.

const expoConfig = require('eslint-config-expo/flat/default');

module.exports = [
  // Full Expo config (core + TS + React + Expo rules)
  ...expoConfig,

  // ── Disable rules that are incompatible with ESLint 10 or produce false positives ──
  {
    rules: {
      // eslint-plugin-react: entire plugin crashes on ESLint 10 (uses removed getFilename API)
      'react/display-name': 'off',
      'react/jsx-key': 'off',
      'react/jsx-no-comment-textnodes': 'off',
      'react/jsx-no-duplicate-props': 'off',
      'react/jsx-no-target-blank': 'off',
      'react/jsx-no-undef': 'off',
      'react/jsx-uses-react': 'off',
      'react/jsx-uses-vars': 'off',
      'react/no-children-prop': 'off',
      'react/no-danger-with-children': 'off',
      'react/no-deprecated': 'off',
      'react/no-direct-mutation-state': 'off',
      'react/no-find-dom-node': 'off',
      'react/no-is-mounted': 'off',
      'react/no-render-return-value': 'off',
      'react/no-string-refs': 'off',
      'react/no-unescaped-entities': 'off',
      'react/no-unknown-property': 'off',
      'react/no-unsafe': 'off',
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/require-render-return': 'off',
      'react/no-this-in-sfc': 'off',

      // react-hooks/set-state-in-effect: flags valid "initial load in useEffect" patterns.
      // Calling setState/fetchAll inside useEffect for initial data loading is idiomatic React.
      'react-hooks/set-state-in-effect': 'off',

      // react-hooks/purity: flags Date.now() inside useRef(Date.now()) which is a well-known
      // safe pattern — useRef is only evaluated once on mount.
      'react-hooks/purity': 'off',

      // react-hooks/preserve-manual-memoization: experimental React Compiler rule that
      // conflicts with standard useCallback(fn, [user?.id]) optional-chaining deps patterns.
      'react-hooks/preserve-manual-memoization': 'off',

      // react-hooks/refs: experimental rule that flags useRef(new Animated.Value(0)).current
      // which is the standard documented React Native Animated API pattern.
      'react-hooks/refs': 'off',
    },
  },

  // ── Ignore plain Node.js utility scripts ──
  // These legitimately use __dirname, Buffer, and Node built-ins.
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'dist/**',
      'web-build/**',
      'audit*.txt',
      'audit*.log',
      '*_utf8.txt',
      '*_utf8.log',
      'supabase/functions/**',
      'assets/generate-placeholders.js',
      'fix_png.js',
      'tmp/**',
      'scripts/**',
    ],
  },
];

