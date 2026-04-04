# Catapult 2026

Renewables Site Scout is a map-first frontend application for selecting geographic regions and estimating deployment outcomes for solar panels or wind turbines.

## Frontend Functionality

The frontend (in [frontend](frontend)) provides:

- A landing experience with smooth fade transition into the app.
- A full-screen Leaflet map as the persistent visual background.
- Overlay UI controls that stay above the map and do not block map navigation.
- Two coordinate inputs in strict DMS format, with validation feedback.
- Click-to-populate coordinate workflow from the map.
- Region selection tools:
  - Rectangle (from two coordinates)
  - Circle (center + edge click)
  - Polygon (multi-point click + close)
- Energy analysis configuration:
  - Energy type dropdown (solar or wind)
  - Model source dropdown (predefined or custom)
  - Model/specification input
- Analysis result popup near selected region with:
  - Estimated capacity fit
  - Construction cost
  - Equipment cost
  - Estimated annual production
- Region refocus button if users navigate away.
- Light mode default with optional dark mode.

## Frontend Architecture

### Layering model

The UI is intentionally split into two layers:

1. Map layer (`z-index: 1`)

- Holds the Leaflet map and all map geometry.
- Always visible and interactive.

2. UI layer (`z-index: 20`)

- Contains controls and panels.
- Uses `pointer-events` strategy so only controls intercept input and the map remains usable.

### Key files

- App shell and behavior: [frontend/src/App.jsx](frontend/src/App.jsx)
- Layering and component styles: [frontend/src/App.css](frontend/src/App.css)
- Global base styles: [frontend/src/index.css](frontend/src/index.css)
- Vite + test configuration: [frontend/vite.config.js](frontend/vite.config.js)
- ESLint configuration: [frontend/eslint.config.js](frontend/eslint.config.js)

### Data flow summary

1. User defines points and/or map-drawn region.
2. Input validation ensures DMS and required fields are complete.
3. Compute action runs estimation logic.
4. Region remains highlighted and popup displays metrics near region center.

## Local Setup

### Prerequisites

- Node.js 22+
- npm 10+

### Install

```bash
cd frontend
npm ci
```

### Run dev server

```bash
npm run dev
```

## Linting, Formatting, and Style Consistency

The frontend enforces style and quality using ESLint + Prettier.

### Commands

```bash
cd frontend
npm run lint
npm run lint:fix
npm run format:check
npm run format
```

### Notes

- `npm run lint` validates code quality rules.
- `npm run format:check` verifies formatting without changing files.
- `npm run format` applies formatting changes.

## Frontend Testing

Vitest + Testing Library are configured for UI/UX behavior validation.

### Run tests

```bash
cd frontend
npm run test
```

### Current test coverage focus

- Landing overlay interaction and transition entry.
- DMS input validation feedback.
- Required input gating before enabling compute action.
- Advanced settings dropdown behavior.

Test file:

- [frontend/src/App.test.jsx](frontend/src/App.test.jsx)

## Build

```bash
cd frontend
npm run build
```

Build output is generated in `frontend/dist`.

## Git Workflow and Deployment Strategy

This repo is configured so deployment uses production build artifacts only.

### Principle

- Source code is versioned on `main`.
- Deployment publishes only `frontend/dist` output to GitHub Pages.
- `frontend/dist` is ignored locally in git.

### CI (pull requests + main)

Workflow: [/.github/workflows/ci.yml](.github/workflows/ci.yml)

Runs:

1. Install dependencies
2. Lint
3. Format check
4. Tests
5. Production build

### GitHub Pages deployment (main only)

Workflow: [/.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml)

Runs on push to `main`:

1. Lint + test + build in `frontend`
2. Build with `VITE_BASE_PATH=/<repo-name>/`
3. Upload `frontend/dist` as Pages artifact
4. Deploy artifact to GitHub Pages

This ensures the deployed site is generated from production output and not from working source files.

## GitHub Pages Setup

In repository settings:

1. Go to `Settings -> Pages`.
2. Set Source to `GitHub Actions`.
3. Merge changes to `main` to trigger deployment.

After deployment, the Pages URL is shown in the deploy workflow run output.
