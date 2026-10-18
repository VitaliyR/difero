import js from '@eslint/js';
import globals from 'globals';
import svelte from 'eslint-plugin-svelte';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...svelte.configs.recommended,
  ...svelte.configs.prettier,
  {
    files: ['**/*.svelte', '**/*.svelte.js'],
    languageOptions: { globals: globals.browser },
    rules: { 'svelte/prefer-svelte-reactivity': 'off' },
  },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
];
