# UI/UX Visual QA Retest - 2026-04-24

## Context
- Follow-up from: `docs/uiux-visual-qa-2026-04-24.md`
- Objective: verify fix for `Unauthorized` artifact leakage on UI surface
- Public URL tested: URL quick tunnel aktif saat retest
- Build source: latest deploy from `/opt/schoolhub` after API token bootstrap/interceptor patch (`apps/web/src/lib/api.ts`)

## Validation Summary
- Backend/API smoke: PASS (`scripts/uat_smoke.sh` -> `27/27`)
- Visual retest capture: PASS
- `Unauthorized` text check from rendered page body: all tested pages returned `false`

Returned check object from Playwright run:
```json
{
  "desktop_admin_jadwal": false,
  "desktop_admin_live_monitor": false,
  "desktop_guru_presensi": false,
  "desktop_siswa_dashboard": false,
  "mobile_admin_jadwal": false,
  "mobile_admin_live_monitor": false,
  "mobile_guru_presensi": false
}
```

## Evidence Paths
- Capture batch:
  - `output/playwright/qa-visual-20260424-fix/evidence/desktop`
  - `output/playwright/qa-visual-20260424-fix/evidence/mobile`
- Key pages (previously problematic):
  - `output/playwright/qa-visual-20260424-fix/evidence/desktop/admin_admin_jadwal.png`
  - `output/playwright/qa-visual-20260424-fix/evidence/desktop/guru_guru_presensi.png`
  - `output/playwright/qa-visual-20260424-fix/evidence/mobile/admin_admin_live-monitor.png`

## Conclusion
- `Unauthorized` UI leakage issue is resolved on tested flows/surfaces.
- Quality gate for this specific blocker is now **PASS**.
