# Full System Audit SIAB2 — 2026-07-13

## 1. Ringkasan Eksekutif

Audit source runtime menemukan **tidak ada P0 terverifikasi**, tetapi terdapat kekurangan P1 yang harus ditutup sebelum sistem dianggap production-hardened:

1. pembatasan mode Android reader belum ditegakkan server-side;
2. replay protection reader non-atomik dan fail-open ketika Redis gagal;
3. antrean offline Android dapat mengubah waktu kejadian dan membuang scan saat gangguan sementara;
4. penjadwalan belum menjaga integritas guru, mapel, kelas, dan periode akademik;
5. rekonsiliasi serta laporan historis masih memakai enrollment saat ini, bukan snapshot/tanggal kejadian;
6. generator kartu produksi mempersist data sensitif di `localStorage`;
7. APK dapat dipublikasikan tanpa verifikasi package/signer resmi;
8. backup legacy dapat menghasilkan salinan DB plaintext;
9. deployment dapat memberi label Git SHA pada build dari working tree kotor;
10. audit writer memindai seluruh trusted epoch sebelum setiap append sehingga biaya tumbuh linear.

Baseline compile, lint, unit test, build, dan dependency audit lokal lulus. Artinya temuan utama bukan error sintaks, melainkan celah kontrak bisnis, trust boundary, historical integrity, reliability, dan operasi yang belum dicakup test sekarang. Temuan alur source berstatus **VERIFIED_BY_INSPECTION**; hanya perilaku yang punya gate/test aktual disebut **TEST_VERIFIED**. Konfigurasi dan keadaan VPS berstatus **RUNTIME_UNVERIFIED**.

## 2. Scope dan Batas

### Diaudit

- `apps/api/`
- `apps/web/`
- `apps/worker/`
- `apps/android-reader/`
- `packages/shared/`
- `prisma/`
- `DataSekolah/generator-tanda-pengenal/`
- `ops/`, `scripts/`, konfigurasi deployment, backup, health, dan CI

### Tidak dianggap runtime utama

- `videos/siab2-tutorial/`
- `Data Akun/generator-tanda-pengenal/`
- output kartu privat dan arsip lokal
- area legacy/support tanpa bukti dipakai runtime

### Prinsip anti-scope-creep

Temuan hanya dicatat bila ada salah satu kondisi berikut:

- data yang ada dapat salah, hilang, tertukar, atau tidak konsisten;
- pengguna yang salah dapat menjalankan aksi yang sudah ada;
- kontrol keamanan yang diklaim dapat dilewati;
- operasi yang sudah ada dapat gagal diam-diam;
- laporan yang sudah ada dapat memberi hasil historis salah;
- deployment/backup yang sudah ada tidak dapat dipulihkan atau direproduksi dengan aman.

Laporan tidak mengusulkan modul tambahan yang tidak diperlukan. Model penugasan guru hanya direkomendasikan karena kebutuhan operasional telah dikonfirmasi: guru, mapel, dan kelas harus dipasangkan secara resmi.

## 3. Status Verifikasi

| Gate | Hasil |
|---|---|
| `npm run typecheck:all` | PASS |
| `npm run lint:all` | PASS |
| API unit test | 40 suite, 405 test PASS |
| Web unit test | 7 file, 46 test PASS |
| Worker test | 17 PASS, 1 SKIP, 0 FAIL |
| `npm run build:all` | PASS |
| Generator produksi test | 12 PASS |
| Generator produksi lint | PASS |
| Generator produksi build | PASS; warning chunk 961.18 kB |
| npm audit root/API/web/worker/generator | 0 vulnerability pada semua severity |
| Android `./test-jdk17.sh` | BLOCKED; JDK 17/21 tidak tersedia |
| VPS `/opt/schoolhub/current` | BLOCKED; SSH gagal sebelum autentikasi dengan `No route to host` |

Temuan source berstatus **VERIFIED_BY_INSPECTION**. Baseline gate yang benar-benar dijalankan berstatus **TEST_VERIFIED**. Android compile/test, kesamaan source dengan runtime VPS, konfigurasi aktif, timer, backup aktual, container digest, Redis, queue, APK, dan bundle produksi tetap **RUNTIME_UNVERIFIED** atau **BLOCKED**.

## 4. Skala Prioritas

- **P0** — kehilangan kendali sistem/data luas sedang terjadi atau eksploitasi kritis langsung; tidak ditemukan terverifikasi.
- **P1** — risiko tinggi terhadap presensi, credential, integritas historis, atau production control; perbaiki sebelum hardening dinyatakan selesai.
- **P2** — risiko penting tetapi blast radius/kondisinya lebih terbatas; selesaikan setelah P1.
- **P3** — maintainability/performance/observability yang belum menjadi insiden langsung.

## 5. Temuan P1

### P1-01 — Mode reader dapat melewati allowlist server

**Dampak:** target `CHECK_ONLY` atau reader dengan satu mode resmi dapat meminta mode mutasi lain selama request memiliki signature sah.

**Bukti:**

- `apps/api/src/modules/attendance-gate/attendance-gate.service.ts:425-439`
- `apps/api/src/modules/security/device-signature.service.ts:166-217`
- `apps/api/src/modules/attendance-gate/attendance-gate.service.spec.ts:352-358`

`qrReaderScan()` memverifikasi signature sebelum menghitung `requestedMode`, tetapi tidak memberikan `expectedMode` ke verifier. Verifier sudah mendukung pemeriksaan `allowedModes`, tetapi hanya ketika array tidak kosong. Jalur admin juga dapat melemahkan pin: `effectiveAllowedModes()` memberi semua mode untuk `QR_ANDROID`, provisioning legacy memakai default tersebut, dan `updateReader()` mengembalikan QR Android ke semua mode.

Bukti tambahan:

- `apps/api/src/modules/device-reader/device-reader.service.ts:60-88`
- `apps/api/src/modules/device-reader/device-reader.service.ts:241-246`
- `apps/api/src/modules/device-reader/device-reader.service.ts:334-390`
- `apps/api/src/modules/device-reader/device-reader.service.ts:506-518`

**Perbaikan minimum:** validasi `requestedMode`, lalu panggil verifier dengan `expectedMode: requestedMode`; reader produksi dengan `allowedModes` kosong harus ditolak. Create/update/provisioning juga wajib mempertahankan mode target pinned dan tidak boleh mengubah target produksi menjadi mode penuh.

**Validasi:** test `CHECK_ONLY` ditolak untuk mode mutasi, reader gerbang ditolak untuk `MUSHOLA`, dan setiap target resmi tetap menerima mode sendiri.

---

### P1-02 — Replay protection reader non-atomik dan fail-open

**Dampak:** dua request signed identik dapat sama-sama lolos saat paralel. Saat Redis gagal, nonce tidak tersimpan tetapi request tetap diproses.

**Bukti:**

- `apps/api/src/modules/security/device-signature.service.ts:228-237`
- `apps/api/src/modules/redis/redis.service.ts:65-83`
- pembanding worker yang lebih aman: `apps/api/src/modules/reconciliation/reconciliation.controller.ts:157-158`

Reader memakai pola `GET nonce` lalu `SET`, bukan klaim atomik. Hasil `setPx()` tidak dipakai untuk fail-closed.

**Perbaikan minimum:** setelah signature valid, klaim nonce melalui satu `SET NX PX`; replay ditolak, Redis unavailable ditolak di production.

**Validasi:** dua request identik paralel menghasilkan tepat satu sukses; Redis down tidak menghasilkan mutasi presensi.

---

### P1-03 — Scan offline memakai waktu retry, bukan waktu scan

**Dampak:** scan dapat masuk hari bisnis, arah gerbang, atau jendela ibadah yang salah setelah perangkat kembali online.

**Bukti:**

- `apps/android-reader/app/src/main/java/id/sch/man1rokanhulu/absensi/MainActivity.kt:252-264`
- `apps/android-reader/app/src/main/java/id/sch/man1rokanhulu/absensi/network/SchoolHubApiClient.kt:99-110`
- `apps/android-reader/app/src/main/java/id/sch/man1rokanhulu/absensi/data/PendingScan.kt:12-18`
- `apps/api/src/modules/attendance-gate/attendance-gate.service.ts:434-455`

Queue menyimpan `createdAt`, tetapi request retry mengirim `Instant.now()`. DTO sudah menerima `clientScannedAt`, namun keputusan bisnis server tetap memakai waktu penerimaan. Timestamp signature harus tetap waktu pengiriman; `clientScannedAt` harus menjadi waktu kejadian yang divalidasi terpisah.

**Perbaikan minimum:** kirim timestamp scan asli; server menerima timestamp offline hanya dalam batas umur ketat, menandai sumber offline, menyimpan received-at terpisah, dan menolak scan terlalu tua/masa depan.

**Validasi:** test reconnect sebelum/sesudah pergantian tanggal Jakarta, arah gerbang, dan jendela ibadah.

---

### P1-04 — Antrean Android membuang scan pada semua HTTP non-2xx

**Dampak:** scan hilang permanen saat `429`, `500`, `502`, atau `503`.

**Bukti:**

- `apps/android-reader/app/src/main/java/id/sch/man1rokanhulu/absensi/MainActivity.kt:263-290`
- `apps/android-reader/app/src/main/java/id/sch/man1rokanhulu/absensi/network/SchoolHubApiClient.kt:115`
- `apps/android-reader/app/src/main/java/id/sch/man1rokanhulu/absensi/data/PendingScan.kt:17-18`

`attempts` tersedia, tetapi semua `scan.ok == false` dianggap terminal dan row dihapus.

**Perbaikan minimum:** `408`, `425`, `429`, dan `5xx` tetap di queue dengan bounded backoff; hanya rejection bisnis terminal `4xx` dihapus; tampilkan status retry ke operator.

**Validasi:** `503/429` mempertahankan row, `400/403` terminal menghapus, retry sukses menghapus tepat sekali.

---

### P1-05 — Jadwal menerima user non-guru atau nonaktif sebagai pengajar

**Dampak:** sesi resmi dapat menunjuk siswa/admin/akun nonaktif sebagai guru; dashboard dan presensi kemudian tidak punya pemilik operasional yang benar.

**Bukti:**

- `prisma/schema.prisma:399-435`
- `prisma/schema.prisma:911-940`
- `apps/api/src/modules/scheduling/scheduling.service.ts:115-231`

FK hanya memastikan `teacherId` menunjuk `User`. Create/update jadwal dan direct session tidak memeriksa role serta status akun.

**Perbaikan minimum:** sebelum persistence, target wajib akun aktif dengan role guru yang sah.

**Validasi:** test siswa/admin/nonaktif ditolak; guru aktif diterima.

---

### P2-01 — Penugasan guru–mapel–kelas belum divalidasi

**Dampak:** admin dapat membuat pasangan guru dan bidang studi yang bukan tanggung jawabnya; guru tetap menerima sesi tersebut sebagai jadwal resmi.

**Bukti:**

- `prisma/schema.prisma:911-940`
- `apps/api/src/modules/scheduling/scheduling.dto.ts:25-69`
- `apps/api/src/modules/scheduling/scheduling.service.ts:176-231`
- `apps/api/src/modules/teacher/teacher.service.ts:48-143`

`teacherId`, `subjectId`, dan `classId` diterima independen. Tidak ditemukan sumber assignment resmi.

**Perbaikan minimum:** simpan penugasan efektif guru–mapel–kelas–periode sebagai sumber otoritatif, lalu validasi create/update/generate schedule terhadap assignment itu. Ini kontrol integritas untuk fitur jadwal yang sudah ada, bukan fitur pengajaran baru.

**Validasi:** pasangan resmi diterima; salah guru, mapel, kelas, semester, atau periode ditolak.

---

### P2-02 — Rentang waktu/tanggal jadwal belum divalidasi

**Dampak:** weekly schedule invalid dapat tersimpan lalu gagal saat generate atau membawa masa berlaku terbalik.

**Bukti:**

- `apps/api/src/modules/scheduling/scheduling.dto.ts:35-69`
- `apps/api/src/modules/scheduling/scheduling.service.ts:176-231`
- `prisma/schema.prisma:911-940`

Create/update tidak menolak:

- `endTime <= startTime`;
- `effectiveTo < effectiveFrom`.

`academicYearId` dan `semesterId` memang opsional pada schema. Apakah keduanya wajib, harus aktif, harus saling cocok, dan harus membatasi tanggal efektif merupakan **NEEDS_DECISION** dari pemilik proses akademik—bukan defect terverifikasi saat ini.

**Perbaikan minimum:** validasi dua rentang yang pasti invalid sebelum persistence. Setelah kontrak periode diputuskan, tambahkan validasi relasi tanpa menebak kebutuhan.

**Validasi:** test boundary waktu/tanggal dan rentang valid.

---

### P1-06 — Rekonsiliasi historis memakai enrollment live, bukan roster sesi

**Dampak:** transfer/keluar/aktivasi ulang siswa dapat mengubah hasil rekonsiliasi sesi lama dan membuat flag untuk siswa yang bukan anggota kelas pada tanggal sesi.

**Bukti:**

- snapshot tersedia di `prisma/schema.prisma:470-504`
- roster ditangkap di `apps/api/src/modules/attendance-class/attendance-class.service.ts:145-211`
- rekonsiliasi memakai enrollment di `apps/api/src/modules/reconciliation/reconciliation.service.ts:422-585`

**Perbaikan minimum:** gunakan `SessionRoster` sebagai sumber keanggotaan. Fallback enrollment hanya untuk data legacy, harus difilter terhadap business date dan diberi klasifikasi tidak terverifikasi.

**Validasi:** transfer setelah sesi tidak mengubah hasil rekonsiliasi sesi lama; siswa di luar roster tidak mendapat flag.

---

### P1-07 — Laporan historis memakai enrollment/kelas saat ini

**Dampak:** laporan harian dan ibadah lama dapat menampilkan kelas terbaru, menghilangkan siswa lama, atau memasukkan siswa sebelum tanggal masuk kelas.

**Bukti:**

- `apps/api/src/modules/reporting/reporting.service.ts:1567-1655`
- `apps/api/src/modules/reporting/reporting.service.ts:1662-1800`

Prayer report memakai `enrollments where active: true`. Daily completeness tidak menyelesaikan membership per tanggal laporan.

**Perbaikan minimum:** resolve enrollment berdasarkan tanggal kejadian, atau gunakan roster snapshot sesi untuk laporan presensi kelas.

**Validasi:** test siswa pindah kelas di tengah bulan dan laporan sebelum/sesudah tanggal efektif.

---

### P1-08 — Generator kartu mempersist data sensitif di `localStorage`

**Dampak:** password impor, raw row, biodata, dan QR credential aktif dapat tersisa setelah generator ditutup atau user logout.

**Bukti:**

- `DataSekolah/generator-tanda-pengenal/src/utils/csvParser.js:71-122`
- `DataSekolah/generator-tanda-pengenal/src/store/useStore.js:7-194`

Parser mempertahankan `password`, `raw`, dan `qrCode`. Zustand `persist` menyimpan `users`.

**Perbaikan minimum:** buang `password` dan `raw` saat parse; jangan persist `users`/QR credential; gunakan memory/session lifecycle; migrasi startup menghapus storage versi lama.

**Validasi:** setelah import/export dan logout/reload, `localStorage` tidak berisi password, QR payload, identitas resmi, tanggal lahir, atau raw row.

---

### P2-03 — APK dipublikasikan tanpa verifikasi package dan signer

**Dampak:** akun operator privileged yang disalahgunakan atau human error dapat mempublikasikan APK salah/debug/unsigned. SHA-256 hanya membuktikan file download sama dengan file upload, bukan bahwa file resmi SIAB2.

**Bukti:**

- `apps/api/src/modules/mobile/mobile-android.service.ts:129-155`
- `apps/api/src/modules/mobile/mobile-android.service.ts:233-285`
- `apps/android-reader/app/src/main/java/id/sch/man1rokanhulu/absensi/update/ApkUpdateInstaller.kt:37-75`

**Perbaikan minimum:** sebelum publish, verifikasi package ID, `versionCode`, dan certificate digest terhadap allowlist server-side yang tidak berasal dari metadata upload.

**Validasi:** APK official lolos; debug, unsigned, package/signer/version mismatch ditolak.

---

### P1-09 — Backup DB legacy dapat plaintext

**Dampak:** salinan penuh data personal dapat tersimpan sebagai `.sql.gz` tanpa enkripsi bila timer legacy masih aktif.

**Bukti:**

- `scripts/backup_database.sh:19-39`
- `ops/systemd/schoolhub-db-backup.service:9-13`
- `docs/production-runbook.md:46-86` masih memerintahkan enable timer legacy dan mendokumentasikan `.sql.gz` plaintext
- jalur aman pembanding: `scripts/backup_production.sh:50-177`
- `ops/systemd/schoolhub-backup.service:10-11`

Legacy script mengenkripsi hanya bila passphrase tersedia; unit legacy tidak memuat `EnvironmentFile`.

**Perbaikan minimum:** pensiunkan/mask timer legacy; sisakan backup production yang fail-closed bila passphrase kosong; perbarui runbook agar tidak mengaktifkan kembali jalur plaintext.

**Validasi VPS:** hanya timer encrypted aktif; output selalu `.dump.enc`; decrypt/list/restore drill lulus.

---

### P1-10 — Deploy dapat memberi label SHA pada source kotor

**Dampak:** image bernama Git SHA dapat memuat perubahan uncommitted, sehingga rollback dan investigasi tidak reproducible.

**Bukti:**

- `scripts/deploy_production.sh:35-54`
- `scripts/deploy_production.sh:253-301`

`TARGET_SHA` berasal dari HEAD, tetapi tidak ada clean-tree gate sebelum `compose build --pull`.

**Perbaikan minimum:** production deploy menolak tracked working tree kotor. Bila runtime bukan checkout Git, gunakan content manifest/digest sebagai provenance dan jangan mengklaim SHA murni.

**Validasi:** satu tracked edit membuat deploy/dry-run fail; clean source menghasilkan digest yang cocok dengan container final.

---

### P2-04 — Audit writer memindai seluruh active epoch pada setiap append

**Dampak:** latency write audit tumbuh linear seiring jumlah entry. Karena banyak transaksi bisnis wajib menulis audit, pertumbuhan chain dapat memperlambat atau menghentikan operasi presensi/admin.

**Bukti:**

- `apps/api/src/common/audit-log.ts:151-250`
- `assertPersistedActiveEpochLineage()` mengambil seluruh entry `startSequence..stateSequence` lalu memverifikasi ulang chain sebelum append.

Kontrol ini fail-closed dan melindungi integritas, tetapi biaya per append adalah O(n), sehingga total pertumbuhan kerja mendekati O(n²).

**Perbaikan minimum:** jangan melemahkan fail-closed. Gunakan verifikasi tip/boundary yang konstan pada write path dan full-chain verification terjadwal/preflight; simpan checkpoint kriptografis yang dapat diverifikasi.

**Validasi:** corruption tip/boundary tetap menolak write; benchmark append pada chain besar menunjukkan latency bounded; full verifier tetap mendeteksi corruption historis.

## 6. Temuan P2

### P2-05 — Admin API dapat membuat atau mengubah QR Android di luar empat target pinned

**Dampak:** kontrak empat target server-pinned dapat dilewati lewat create reader, provisioning legacy, atau update yang mengembalikan semua mode.

**Bukti:**

- `apps/api/src/modules/device-reader/device-reader.controller.ts:73-110`
- `apps/api/src/modules/device-reader/device-reader.service.ts:60-88`
- `apps/api/src/modules/device-reader/device-reader.service.ts:241-246`
- `apps/api/src/modules/device-reader/device-reader.service.ts:334-430`
- `apps/api/src/modules/device-reader/device-reader.service.ts:506-518`

**Perbaikan minimum:** production hanya mengizinkan empat target allowlist dan `:id/android/provision-code`; create/update/provisioning bebas harus ditolak atau gated eksplisit non-production.

---

### P2-06 — API dapat ready tanpa Redis

**Dampak:** limiter menjadi process-local, live outbox/SSE terdegradasi, dan nonce reader tidak distributed, tetapi readiness masih sukses.

**Bukti:**

- `apps/api/src/config/env.validation.ts:57-61`
- `apps/api/src/modules/redis/redis.service.ts:12-52`
- `apps/api/src/modules/health/health.service.ts:34-52`

**Perbaikan minimum:** `REDIS_URL` wajib production; `/health/ready` non-200 bila Redis disabled/down.

---

### P2-07 — Corrections dapat lost update dan status sah belum dikontrakkan eksplisit

**Dampak:** dua koreksi bersamaan dapat saling menimpa. Source hanya menolak `SCHEDULED`; apakah `MISSED` boleh dikoreksi merupakan keputusan bisnis yang belum dibuktikan.

**Bukti:**

- `apps/api/src/modules/attendance-class/attendance-class.dto.ts:89-103`
- `apps/api/src/modules/attendance-class/attendance-class.service.ts:1187-1265`
- batch normal sudah punya version check di `apps/api/src/modules/attendance-class/attendance-class.service.ts:600-626`

**Perbaikan minimum:** expected version pada correction dan conditional update. Pemilik proses harus menetapkan apakah `MISSED` boleh dikoreksi; setelah itu gunakan allowlist status eksplisit, bukan inferensi.

---

### P2-08 — Rekonsiliasi belum punya claim dan transaction boundary tunggal

**Dampak:** dua runner dapat memproses sesi sama; flag tersimpan sebelum `reconciledAt`; flag resolved dapat dibuka lagi pada rerun.

**Bukti:**

- `apps/api/src/modules/reconciliation/reconciliation.service.ts:390-418`
- `apps/api/src/modules/reconciliation/reconciliation.service.ts:497-678`

**Perbaikan minimum:** atomic claim per session; perubahan flag + marker dalam satu boundary; jangan reopen resolved tanpa evidence change/aksi eksplisit.

---

### P2-09 — Volume APK tidak masuk backup/restore

**Dampak:** DB release pulih tetapi file APK hilang; forced update dapat menawarkan artifact yang tidak dapat diunduh.

**Bukti:**

- `docker-compose.production.yml:186-190,316`
- `scripts/backup_production.sh:130-177`

**Perbaikan minimum:** backup terenkripsi artifact APK atau object/artifact store berversi; restore verification mengunduh latest APK dan mencocokkan hash DB.

---

### P2-10 — Source generator dan bundle web tidak dijaga CI

**Dampak:** source diperbaiki tetapi bundle produksi tetap lama, atau bundle berubah tanpa bukti berasal dari source yang diuji.

**Bukti:**

- `.github/workflows/ci.yml:81-98`
- `package.json:13-22`
- `apps/web/Dockerfile`

Root CI/build tidak menjalankan `DataSekolah/generator-tanda-pengenal` dan tidak memeriksa sinkronisasi bundle.

**Perbaikan minimum:** script deterministik test/lint/build/sync; CI fail bila hasil build berbeda dari `apps/web/public/id-card-generator/`.

---

### P2-11 — Operasi QR berhenti diam-diam pada 1.000 user

**Dampak:** bulk generation/readiness/export dapat terlihat lengkap walau sebagian user tidak diproses.

**Bukti:** `apps/api/src/modules/qr-credentials/qr-credentials.service.ts:180,229,315`.

**Perbaikan minimum:** cursor batching. Jika limit dipertahankan, response wajib `incomplete/truncated` dan UI tidak boleh mengklaim selesai.

---

### P2-12 — Worker DLQ/failure belum menjadi health criterion

**Dampak:** job gagal permanen dapat masuk DLQ, tetapi health job tersebut kembali sehat setelah siklus berikutnya sukses sehingga kegagalan/DLQ lama tidak lagi menjadi criterion.

**Bukti:**

- `apps/worker/src/index.js:73-219`
- `docker-compose.production.yml:233-243`

`WORKER_MAX_CONSECUTIVE_FAILURES` dikonfigurasi tetapi tidak digunakan. Health terutama bergantung pada `lastSuccessAt` dan queue utama.

**Perbaikan minimum:** health memasukkan consecutive failures, DLQ count, oldest pending age, dan last success per job.

---

### P2-13 — Riwayat “Kehadiran Saya” dipotong diam-diam dan memakai rolling UTC

**Dampak:** UI menawarkan 120 hari, tetapi API membatasi maksimum 60 hari tanpa metadata. Setiap sumber juga dibatasi `take: 300`, sehingga histori dapat parsial. Rolling UTC dapat memotong hari sekolah Jakarta.

**Bukti:**

- `apps/web/src/app/pages/siswa/MyAttendancePage.jsx:171-192`
- `apps/api/src/modules/reporting/reporting.service.ts:715-785`

**Perbaikan minimum:** selaraskan pilihan UI/API, gunakan business-day bounds Asia/Jakarta, pagination/cursor, dan response `truncated` bila cap masih dipakai.

## 7. Temuan P3

### P3-01 — Bundle generator besar

Build generator menghasilkan main chunk sekitar **961.18 kB** minified. Ini bukan correctness blocker karena generator merupakan tool admin, tetapi initial load dan memory workstation lebih tinggi.

**Perbaikan minimum:** lazy-load modul export/PDF/canvas yang berat. Kerjakan setelah P1/P2.

### P3-02 — List reader memakai N+1 query

`apps/api/src/modules/device-reader/device-reader.service.ts:169-187` melakukan dua query log per reader. Risiko operasional terbatas karena target produksi hanya empat reader aktif, tetapi data historis/pagination tetap dapat memperbesar query.

**Perbaikan minimum:** batch dua query log dan merge di memory bila profiling menunjukkan latency nyata.

### P3-03 — Browserslist data generator stale

Build memperingatkan `caniuse-lite` berumur sekitar enam bulan.

**Perbaikan minimum:** update terjadwal melalui dependency PR yang diuji; bukan emergency change.

## 8. Coverage Gap yang Harus Menjadi Regression Test

1. allowlist mode reader dan atomic nonce replay;
2. retry offline `429/5xx` dan timestamp scan asli;
3. role/active serta assignment guru–mapel–kelas;
4. weekly schedule time/effective boundary; academic-period tests menunggu keputusan kontrak;
5. transfer siswa terhadap roster, reconciliation, daily completeness, dan prayer report;
6. correction/reconciliation concurrency;
7. resolved flag rerun;
8. APK package/signer validation;
9. generator storage migration dan no-sensitive-localStorage assertion;
10. clean-tree deployment provenance;
11. encrypted backup timer serta APK artifact restore;
12. QR batch lebih dari 1.000 user;
13. worker DLQ health;
14. 120-day attendance range, pagination, truncation metadata, dan Jakarta timezone boundary;
15. audit writer performance pada chain besar tanpa melemahkan corruption detection.

## 9. Area yang Sudah Sehat

- API global validation memakai whitelist/transform/forbid-non-whitelisted.
- JWT/session, refresh rotation, token-family reuse detection, dan cookie production punya kontrol kuat.
- Mutasi browser memakai CSRF; worker/device memakai signature sendiri.
- Worker HMAC nonce memakai klaim Redis atomik dan fail-closed.
- Session open/close memakai conditional state transition.
- Attendance per siswa/sesi, roster, prayer, gate direction, dan reconciliation flag punya unique constraints relevan.
- Batch attendance sudah memakai optimistic version check.
- Out-of-roster attendance ditolak.
- Koreksi meminta alasan dan menulis event audit.
- Session overlap dan enrollment overlap dilindungi migration constraint.
- Android menyimpan secret/queue dengan Keystore/AES-GCM, release HTTPS-only, `allowBackup=false`, dan memverifikasi hash download.
- Container utama non-root, read-only, dropped capabilities, healthcheck, resource limit, dan log rotation.
- Nginx punya rate limit, security headers, block internal API, dan `auth_request` untuk generator.
- Backup production baru fail-closed, encrypted, checksum, lock, atomic publish, dan restore verification DB.
- CI mem-pin action SHA dan memiliki banyak gate API/web/integration/security.
- Dependency audit root/API/web/worker/generator: nol vulnerability terdeteksi pada audit ini.

## 10. Evidence yang Masih Harus Dicek di VPS

Ketika jaringan tersedia, lakukan inspeksi read-only untuk membuktikan:

1. source `/opt/schoolhub/current` sama dengan source yang diaudit;
2. image/container digest dan deployment evidence cocok;
3. Redis aktif dan readiness benar-benar bergantung padanya;
4. timer backup legacy tidak aktif;
5. backup terbaru terenkripsi, off-host, dan pernah restore drill;
6. volume APK serta latest artifact tersedia dan hash cocok;
7. Caddy/TLS/HSTS/firewall aktual;
8. worker queue, DLQ, outbox backlog, lag, dan health file;
9. empat reader target dan `allowedModes` aktual;
10. APK published memiliki package dan signer resmi;
11. bundle generator production sama dengan source;
12. audit-chain state, trusted epoch, dan writer latency production;
13. authenticated smoke untuk role kritis dengan credential dedicated melalui kanal aman.

Tidak boleh membaca/menyalin `.env`, credential, QR payload, database personal, atau backup content selama inspeksi.

## 11. Roadmap Perbaikan Minimum

### Gelombang A — Trust boundary scanner

1. enforce mode reader;
2. atomic fail-closed nonce;
3. perbaiki timestamp dan retry queue Android;
4. nonaktifkan provisioning bebas production.

### Gelombang B — Integritas jadwal dan histori

1. role/active guru;
2. validasi rentang waktu/tanggal jadwal;
3. putuskan kontrak assignment guru–mapel–kelas dan periode akademik;
4. reconciliation memakai roster snapshot;
5. laporan historis memakai membership tanggal kejadian.

### Gelombang C — Data sensitif dan supply chain Android

1. hilangkan sensitive `localStorage` generator;
2. verifikasi package/signer APK;
3. CI source-to-bundle generator;
4. backup/restore APK artifact.

### Gelombang D — Reliability dan operasi

1. correction/reconciliation concurrency;
2. Redis production readiness;
3. legacy plaintext backup retirement;
4. clean deploy provenance;
5. worker DLQ health;
6. QR batching.

### Gelombang E — Scale dan akurasi sekunder

1. audit writer bounded write-path verification;
2. 120-day attendance pagination dan Jakarta business-day reporting;
3. reader query batching bila profiling membuktikan perlu;
4. generator code splitting.

Setiap gelombang harus kecil, punya regression test, dan tidak boleh dicampur dengan generator akun lokal, video, audit-history mutation, atau deployment tanpa approval.

## 12. Kesimpulan

Sistem memiliki fondasi keamanan dan test yang lebih kuat daripada aplikasi absensi biasa, tetapi belum layak disebut selesai atau fully hardened. Risiko terbesar bukan kekurangan menu. Risiko terbesar berada pada enforcement server reader, ketahanan scan offline, validitas jadwal, kebenaran histori setelah perpindahan siswa, penyimpanan data kartu, supply chain APK, backup legacy, provenance deployment, dan biaya audit-chain write.

Urutan paling aman: tutup P1 scanner lebih dulu, lalu integritas jadwal/histori, kemudian data sensitif/backup. APK signer, audit performance, dan assignment formal tetap penting, tetapi dikerjakan sesuai prioritas P2 serta keputusan kontrak. Jangan menambah fitur umum sebelum kontrol minimum ini selesai dan diverifikasi.
