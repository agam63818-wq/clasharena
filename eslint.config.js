// eslint.config.js — minimal flat config (ESLint 9).
//
// Scope: real bugs + accessibility problems. Deliberately NOT included: any
// stylistic rules (quotes, semicolons, ordering). A mass style rewrite would
// bury the real fixes in noise.
//
// Two rules are switched OFF here for concrete, verifiable reasons — both were
// checked against this codebase before being disabled:
//
//   1. no-unused-vars in JSX files. Core ESLint cannot tell that a JSX tag
//      *uses* the identifier it references (`<motion.div>`), because that
//      tracking lives in eslint-plugin-react's jsx-uses-vars. Running it here
//      reported ~80 false "defined but never used" errors for components that
//      are clearly used. It stays ON for api/, tests/ and config files, where
//      it found a genuine dead binding (api/deleteTournament.js).
//
//   2. jsx-a11y/control-has-associated-label and the deprecated
//      jsx-a11y/label-has-for. The first never accepts a sibling
//      `<label htmlFor="id">` (its util has no htmlFor handling), so it flagged
//      every correctly-labelled form control in this app. The second is
//      deprecated in favour of label-has-associated-control, which IS enabled
//      at error level below and understands htmlFor + nesting.

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default [
  // Vendored/generated output is never linted.
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', '.vite/**'] },

  js.configs.recommended,

  // --- client code (browser globals, React hooks, JSX a11y) ----------------
  {
    files: ['src/**/*.jsx', 'src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser }
    },
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y
    },
    rules: {
      // Real hook bugs (missing/extra deps, conditional hooks).
      ...reactHooks.configs.recommended.rules,

      // See note 1 above.
      'no-unused-vars': 'off',

      // a11y ERRORS: violations that make a control unusable with assistive
      // technology (unnamed image, dead link, unassociated label, invalid ARIA).
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/label-has-associated-control': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      'jsx-a11y/no-redundant-roles': 'error',
      'jsx-a11y/tabindex-no-positive': 'error',

      // See note 2 above.
      'jsx-a11y/label-has-for': 'off',
      'jsx-a11y/control-has-associated-label': 'off',

      // Remaining a11y smells stay warnings: worth fixing, but not in a
      // behaviour-changing sweep (e.g. click handlers on non-interactive
      // elements need a keyboard path, which is a UX decision).
      // Only genuine interaction handlers: the default list also includes
      // onError, which this app uses for <img> fallbacks — an error handler,
      // not something a user interacts with.
      'jsx-a11y/no-noninteractive-element-interactions': ['warn', {
        handlers: ['onClick', 'onKeyDown', 'onKeyUp', 'onKeyPress', 'onDoubleClick', 'onContextMenu']
      }],
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/anchor-has-content': 'warn'
    }
  },

  // --- server routes, tests and config (node globals, no JSX) -------------
  {
    files: ['api/**/*.js', 'tests/**/*.js', '*.config.js', 'vite.config.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  }
];
