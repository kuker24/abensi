# AGENTS.md - Developer Guidelines

This document provides guidelines for agents working on this codebase.

## Project Overview

- **Type**: React 19 SPA with Vite
- **State Management**: Zustand with persist middleware
- **Styling**: Tailwind CSS
- **Routing**: React Router DOM v7
- **Build Tool**: Vite 7

## Build / Lint / Test Commands

```bash
# Development
npm run dev          # Start Vite dev server

# Build
npm run build        # Build for production (outputs to dist/)
npm run preview      # Preview production build locally

# Linting
npm run lint         # Run ESLint on entire codebase
npm run lint -- --fix   # Auto-fix ESLint issues
```

**Running a single test**: No test framework is currently configured. If adding tests, use:
```bash
npx vitest run src/components/IDCard.test.jsx   # Run single test file with Vitest
npx vitest run --reporter=verbose src/path/to/test  # Run specific test
```

## Code Style Guidelines

### General Principles
- Keep components small and focused (single responsibility)
- Use functional components with arrow functions
- Prefer composition over inheritance
- Avoid premature optimization

### File Organization
```
src/
├── components/       # Reusable UI components
│   ├── cards/       # ID card related components
│   └── layout/      # Layout components (Header, Sidebar, Layout)
├── pages/           # Route pages (Dashboard, ImportData, Users, GenerateCards, Export)
├── store/           # Zustand stores (useStore)
├── utils/           # Utility functions (csvParser, pdfGenerator)
└── assets/          # Static assets
```

### Naming Conventions
- **Components**: PascalCase (e.g., `IDCard.jsx`, `Dashboard.jsx`)
- **Files**: PascalCase for components, camelCase for utilities
- **Functions**: camelCase, use verb prefixes (e.g., `getFilteredUsers`, `exportToPDF`)
- **Constants**: SCREAMING_SNAKE_CASE for config values
- **CSS Classes**: kebab-case (Tailwind utility classes)

### Imports Order
1. External libraries (react, react-router-dom, zustand, lucide-react)
2. Internal components/utilities (relative paths)
3. Style imports (if any)

Example:
```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Upload } from 'lucide-react';
import { useStore } from '../store/useStore';
import IDCard from '../components/cards/IDCard';
import { parseCSV } from '../utils/csvParser';
```

### React Patterns
- Use functional components exclusively
- Destructure props with default values when appropriate
- Use early returns for null/false conditions
- Keep `useState` and `useEffect` calls at the top of components
- Use custom hooks for reusable logic

Example:
```jsx
const IDCard = ({ user, schoolName = 'Default School', scale = 1 }) => {
  if (!user) return null;
  // ...
};
```

### Zustand Store Pattern
```javascript
export const useStore = create(
  persist(
    (set, get) => ({
      // State
      users: [],
      
      // Actions
      setUsers: (users) => set({ users }),
      
      // Computed values as getters
      getStats: () => {
        const state = get();
        return { /* computed */ };
      },
    }),
    {
      name: 'storage-key',
      partialize: (state) => ({ /* fields to persist */ }),
    }
  )
);
```

### Tailwind CSS
- Use utility classes for all styling
- Follow the existing color palette (primary-50 through primary-900)
- Use consistent spacing and sizing
- Keep responsive classes organized (mobile first)

### Error Handling
- Always handle async operations with try/catch
- Store errors in state and display user-friendly messages
- Use the `error` state from useStore for global error handling
- Validate data before processing (especially CSV imports)

Example:
```jsx
try {
  setLoading(true);
  const data = await parseCSV(file);
  setUsers(data);
} catch (err) {
  setError('Failed to parse CSV: ' + err.message);
} finally {
  setLoading(false);
}
```

### ESLint Rules
The project uses ESLint with these key rules:
- No unused variables (except those starting with underscore or capital letters)
- React Hooks rules enforced
- React Refresh for HMR compatibility

Run `npm run lint` before committing to ensure code quality.

## Common Tasks

### Adding a New Page
1. Create component in `src/pages/`
2. Add to barrel export in `src/pages/index.js`
3. Add route in `src/App.jsx`

### Adding a New Component
1. Create component file in appropriate `src/components/` subfolder
2. Export from `src/components/*/index.js` barrel file
3. Import using: `import { ComponentName } from '../components/path'`

### State Management
- Use Zustand for global state
- Use local `useState` for component-specific state
- Use `useEffect` for side effects

## Additional Notes
- No TypeScript is currently in use (plain JavaScript/JSX)
- No test framework configured yet
- Uses browser globals (no Node.js globals)
