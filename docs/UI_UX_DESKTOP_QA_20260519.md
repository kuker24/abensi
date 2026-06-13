# Full Visual QA Desktop — SchoolHub e-Hadir

**Tanggal:** 2026-05-19  
**Step:** 3/24  
**Target:** Production dark-only UI  
**Base URL:** `https://preferences-nail-division-needle.trycloudflare.com`  
**Viewport:** 1440 × 1000, Chromium headless  
**Screenshot folder:** `apps/web/qa-screenshots/final-uiux-desktop/`  
**Raw report:** `/tmp/schoolhub-desktop-visual-qa.json`, `/tmp/schoolhub-login-desktop-qa.json`

## Coverage

| Area | Coverage | Result |
|---|---:|---|
| Login desktop | 1 screen | ✅ Rendered, no horizontal overflow, `MASUK SEBAGAI` white/visible |
| Admin/TU route | 15 routes | ✅ All rendered, no blank screen, no horizontal overflow |
| Operator route | 1 route | ✅ Rendered, no blank screen, no horizontal overflow |
| Piket route | 1 route | ✅ Rendered, no blank screen, no horizontal overflow |
| Developer route | 1 route | ✅ Rendered, no blank screen, no horizontal overflow |
| Guru route | 8 routes | ⚠️ 7 rendered cleanly; `/guru/rekap` shows Forbidden error |
| Siswa route | 3 routes | ✅ All rendered, no blank screen, no horizontal overflow |
| Total app routes | 29 routes + login | ✅ 30 screenshots captured |

## Screenshot Index

Stored in `apps/web/qa-screenshots/final-uiux-desktop/`:

- `login.png`
- `admin__admin-dashboard.png`
- `admin__admin-sessions.png`
- `admin__admin-history.png`
- `admin__admin-anomaly.png`
- `admin__admin-picket.png`
- `admin__admin-master-data.png`
- `admin__admin-schedule.png`
- `admin__admin-devices.png`
- `admin__admin-reports.png`
- `admin__admin-live-monitor.png`
- `admin__admin-settings.png`
- `admin__admin-audit.png`
- `admin__admin-teacher-leaves.png`
- `admin__admin-notifications.png`
- `admin__admin-help.png`
- `operator__admin-it-dashboard.png`
- `picket__admin-picket-dashboard.png`
- `developer__admin-developer-control.png`
- `guru__guru-dashboard.png`
- `guru__guru-presensi.png`
- `guru__guru-koreksi.png`
- `guru__guru-rekap.png`
- `guru__guru-izin.png`
- `guru__guru-kehadiran-saya.png`
- `guru__guru-notifikasi.png`
- `guru__guru-panduan.png`
- `siswa__siswa-dashboard.png`
- `siswa__siswa-notifikasi.png`
- `siswa__siswa-panduan.png`

## Findings

| ID | Severity | Confidence | Area | Evidence | Root-cause area | Fix order |
|---|---|---:|---|---|---|---:|
| DESK-001 | P1 High | High | `/guru/rekap` | Page renders `Forbidden resource` with `Coba lagi`; network HTTP `403` on `/api/v1/reports/teacher-monthly?month=2026-05&page=1&limit=100`. | `TeacherRecapPage` uses endpoint not accessible to regular `GURU_MAPEL`, or backend guard does not allow intended teacher self-report access. | 1 |
| DESK-002 | P2 Medium | High | All pages | Console error on every page: inline script blocked by CSP `script-src 'self'`. | `apps/web/index.html` inline anti-FOUC/script conflicts with production CSP. | 2 |
| DESK-003 | P2 Medium | High | All pages | Google Fonts stylesheet blocked by CSP (`style-src 'self' 'unsafe-inline'`); request failed `csp`. | `apps/web/src/styles.css` imports `https://fonts.googleapis.com/...`; production CSP disallows external style source. | 3 |
| DESK-004 | P2 Medium | Medium | Shell/topbar/sidebar actions | Automated hit-target scan found recurrent controls below 32px height/width: logout icon ~31×31, topbar search height ~26, several tab/action buttons ~28px high. | Shared UI/button/topbar sizing in `SchoolHubApp.tsx`, `ui.tsx`, and `styles.css`. | 4 |

### Non-defects / excluded noise

- Repeated `net::ERR_ABORTED` for `/api/v1/health/live`, `/auth/me`, and static images occurred during fast route navigation/login reset in automation; not visible to users in the captured screens.
- Login image check: code references only `/images/man1-gedung.png`; no `man1-guru-besar` reference found. The screenshot confirms the login page renders without a blank state.

## Pass/Fail Summary

- **Pass:** no blank screens across desktop login + 29 routes.
- **Pass:** no route-level horizontal overflow at 1440px desktop viewport.
- **Pass:** dark-only visual shell is active across tested screens.
- **Fail/P1:** Guru monthly recap endpoint is blocked for the regular guru account.
- **Fail/P2:** CSP/font warnings remain and should be fixed in step 5.
- **Fail/P2:** several compact controls are below preferred accessible hit-target size; include in accessibility/form/table polish steps.

## Next Immediate Action

Lanjut ke step 4: **Full visual QA mobile**.

Mobile QA should reuse the same route inventory and specifically check:

- Bottom/sidebar navigation usability.
- Horizontal overflow on data tables/forms.
- Sticky dock overlap on `/guru/presensi`.
- Login hero/content stacking.
- Touch target size for topbar/search/action buttons.
