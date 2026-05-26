# Table UX Improvement — SchoolHub e-Hadir

**Tanggal:** 2026-05-19  
**Step:** 9/24  
**Status:** Selesai lokal

## Temuan QA

MOB-001: `/admin/reports` has severe horizontal overflow pada mobile (390px → 899px scroll).

## Perubahan

| File | Perubahan |
|---|---|
| `apps/web/src/styles.css` | Menambahkan `.print-letterhead` dan `.print-signature` CSS dengan `max-width: 100%` pada logo, layout flex di mobile. |

## Table UX baseline (existing)

Fit that were already in place:
- **Mobile card layout**: `< 768px` table rows become cards with `data-label` pseudo-elements.
- **`AsyncTable` auto-state**: loading → skeleton table, error → `ErrorState`, empty → `EmptyState`.
- **Pagination**: `Pagination` component hides when ≤ 1 page.
- **Sticky header**: `thead` uses `position: sticky`.
- **Table wrap overflow**: `.table-wrap { overflow-x: auto }` enables horizontal scroll on narrow screens without layout break.

## Verifikasi lokal

```bash
npm run lint --prefix apps/web       # lulus
npm run typecheck --prefix apps/web  # lulus
npm run test --prefix apps/web       # 2 files, 6 tests lulus
npm run build --prefix apps/web      # lulus
```

## Next step: 10 — Polish halaman prioritas

Mencakup step 10-18 yang merupakan polish/QA spesifik pada halaman individual. Pass ini akan menggabungkan QA dari desktop/mobile yang sudah dilakukan, memastikan perbaikan state/table/form yang baru diterapkan ke seluruh halaman.
