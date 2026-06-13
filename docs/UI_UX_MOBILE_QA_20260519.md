# Full Visual QA Mobile — SchoolHub e-Hadir

**Tanggal:** 2026-05-19  
**Step:** 4/24  
**Target:** Production dark-only UI  
**Base URL:** `https://preferences-nail-division-needle.trycloudflare.com`  
**Viewport:** 390 × 844, DPR 2, touch/mobile UA  
**Screenshot folder:** `apps/web/qa-screenshots/final-uiux-mobile/`  
**Raw report:** `/tmp/schoolhub-mobile-visual-qa.json`

## Coverage

| Area | Coverage | Result |
|---|---:|---|
| Login mobile | 1 screen | ✅ Rendered, dark-only, no horizontal overflow |
| Admin/TU route | 15 routes | ⚠️ 14 routes OK; `/admin/reports` has severe horizontal overflow |
| Operator route | 1 route | ✅ Rendered, no blank screen, no horizontal overflow |
| Piket route | 1 route | ✅ Rendered, no blank screen, no horizontal overflow |
| Developer route | 1 route | ✅ Rendered, no blank screen, no horizontal overflow |
| Guru route | 8 routes | ⚠️ 7 routes OK; `/guru/rekap` shows Forbidden error |
| Siswa route | 3 routes | ✅ Rendered, no blank screen, no horizontal overflow |
| Total tested | 29 routes + login | ✅ 30 screenshots captured |

## Screenshot Index

Stored in `apps/web/qa-screenshots/final-uiux-mobile/`:

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
| MOB-001 | P1 High | High | `/admin/reports` | Mobile screenshot width becomes `899px` on a `390px` viewport. Screenshot shows large report preview/logo expanding the page and leaving a wide blank right area. | Report preview/print layout in `ReportsPage` and related CSS lacks mobile max-width containment. | 1 |
| MOB-002 | P1 High | High | `/guru/rekap` | Same as desktop: inline `Forbidden resource` and HTTP `403` on `/api/v1/reports/teacher-monthly`. | `TeacherRecapPage` endpoint/permission mismatch for `GURU_MAPEL`. | 2 |
| MOB-003 | P2 Medium | High | All authenticated pages | Many nav/menu/button controls are 32–35px high on touch viewport; recommended touch target is 44px. | Sidebar/topbar/shared button sizing in shell CSS. | 3 |
| MOB-004 | P2 Medium | High | All pages | CSP blocks inline script and Google Fonts stylesheet; console noise appears on every mobile route. | Same as desktop: `index.html` inline script and `styles.css` Google Fonts import conflict with production CSP. | 4 |

### Non-defects / excluded noise

- Fast automation produced `net::ERR_ABORTED` for `/health/live`, `/auth/me`, and `/auth/refresh` during login/session resets. These were not visible in screenshots and are excluded from visual defects.
- Off-canvas sidebar appears in DOM with negative `left` values while closed. It did not cause overflow except on `/admin/reports`, where the report preview itself expands the layout.

## Pass/Fail Summary

- **Pass:** mobile login is usable and shows only `/images/man1-gedung.png` visual background.
- **Pass:** no mobile blank screens across the tested route set.
- **Pass:** most dashboard/form/table routes stay within 390px viewport.
- **Fail/P1:** `/admin/reports` is not mobile-safe due oversized preview/logo.
- **Fail/P1:** `/guru/rekap` cannot load data for a normal guru account.
- **Fail/P2:** touch target sizing and CSP/font warnings remain.

## Next Immediate Action

Lanjut ke step 5: **Rapikan CSP/font issue**.

Recommended target for step 5:

1. Remove or replace external Google Fonts import with local/system font stack.
2. Remove inline script from `index.html` or move it into bundled app code.
3. Rebuild and verify console no longer reports CSP/font violations locally/production after deploy.
