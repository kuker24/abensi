import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

const browserGlobals = {
  AbortController: 'readonly',
  Blob: 'readonly',
  CustomEvent: 'readonly',
  Event: 'readonly',
  FormData: 'readonly',
  PopStateEvent: 'readonly',
  Response: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  clearInterval: 'readonly',
  document: 'readonly',
  fetch: 'readonly',
  localStorage: 'readonly',
  navigator: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  window: 'readonly'
};

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module'
      },
      globals: browserGlobals
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true }
      },
      globals: browserGlobals
    },
    rules: {
      'no-undef': 'error'
    }
  }
];
