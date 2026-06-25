# Visual Regression Test Environment

Visual regression baselines are sensitive to browser, font, graphics, and operating system rendering differences. Treat the GitHub Actions visual job as the source of truth for this repository unless a maintainer explicitly approves a different controlled environment.

## Supported environment

The supported visual regression environment is the `web-quality-gates` job in `.github/workflows/ci.yml`:

- GitHub Actions `ubuntu-latest`
- Node.js `20.20.2`
- `npm ci --prefix apps/web`
- Playwright-installed Chromium via:

```bash
npx --prefix apps/web playwright install --with-deps chromium
npm run test:visual
```

Recent reference evidence:

- Main CI run `28153143147` completed successfully after PR #27.
- `web-quality-gates` completed successfully for merge commit `4a23725b68dc7f58beaa947487a1383de2a7d248`.

## Local environment caveat

Desktop Linux environments that do not match CI, especially rolling-release distributions such as CachyOS or Arch-based systems, can produce visual diffs because of differences in:

- browser version,
- Playwright browser cache,
- font availability and font fallback,
- fontconfig/freetype/harfbuzz/cairo/pango versions,
- antialiasing and text shaping,
- device scale factor behavior,
- locale/timezone defaults outside the test config.

Do not update committed baseline screenshots from an arbitrary local desktop environment that does not match the supported CI environment.

## How to classify local visual failures

If a local visual test fails but remote `web-quality-gates` is green and the pull request does not change UI/source/CSS/runtime/test visual config files, classify the failure as **possible environment noise** until proven otherwise.

Before approving any visual change, confirm whether the diff is caused by:

1. a real UI/source change,
2. an intentional baseline change,
3. test instability,
4. or renderer/environment mismatch.

## Snapshot update policy

- Snapshot updates must be reviewed in a separate PR dedicated to visual baselines.
- Do not mix visual baseline updates with Dependabot or dependency-only PRs.
- Do not update baselines just to make a local non-CI renderer pass.
- Include a before/after summary and explain why the baseline update is valid.
- If the source is wrong, fix the source in a separate bugfix branch before updating snapshots.

## Generated artifact policy

Do not commit generated Playwright or visual-regression artifacts, including:

- `test-results/`
- `playwright-report/`
- `blob-report/`
- generated actual/diff screenshots
- temporary diff artifacts

Only intentionally approved baseline files under `apps/web/e2e-visual/__screenshots__/` may be committed, and only in a dedicated visual-baseline review PR.
