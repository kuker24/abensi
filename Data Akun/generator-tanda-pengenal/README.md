# Generator Tanda Pengenal SIAB2

Generator Tanda Pengenal SIAB2 adalah aplikasi frontend internal untuk membuat kartu identitas MAN 1 Rokan Hulu. Mode resmi mengambil data dari database SIAB2; import CSV/manual tetap tersedia hanya sebagai draft layout/testing dan diberi label `DRAFT / TIDAK TERVERIFIKASI`.

## Tujuan

- Mengambil kartu resmi dari Data Sekolah/database SIAB2.
- Menjaga CSV/manual sebagai draft layout/testing, bukan sumber resmi.
- Preview kartu tanda pengenal portrait yang selaras dengan visual SIAB2.
- Export PDF A4 print-ready dan SVG per kartu untuk kebutuhan operasional sekolah.

## Stack

- React + Vite
- Zustand
- Tailwind CSS
- PapaParse
- html2canvas + jsPDF
- qrcode.react

## Mode Sumber Data

1. **Ambil dari Data Sekolah** — sumber resmi DB-backed melalui endpoint SIAB2 yang sudah dilindungi auth/role. Output diberi label `RESMI / DATABASE`.
2. **Import CSV Draft** — hanya untuk draft layout/testing. Output tetap diberi label/watermark `DRAFT / TIDAK TERVERIFIKASI` dan tidak menggantikan data resmi.

Orang yang belum ada di database SIAB2 tidak bisa dibuatkan kartu resmi dari CSV saja.

## Field Wajib CSV Draft

Kolom minimal yang harus tersedia untuk draft kartu:

- `nama`
- `nisn`
- `qr_value` resmi `schoolhub:qr:v1:QR_...` jika tersedia untuk pengujian QR

Kolom `ttl`, `tempat_lahir`, `tanggal_lahir`, dan `alamat` masih boleh diimport sebagai metadata lokal draft, tetapi tidak dicetak pada kartu siswa final saat field resmi belum tersedia di schema.

## Privacy & Data Handling

- Pada mode resmi, generator membaca data kartu dari API SIAB2 yang sudah dilindungi auth/role.
- Pada mode CSV draft, generator tidak mengunggah file CSV ke server; parsing dilakukan di browser.
- Data yang sedang diproses tersimpan sementara di browser `localStorage` perangkat operator dengan key `id-card-generator-storage`.
- Data yang dipersist hanya field yang diizinkan untuk kebutuhan kartu; raw row CSV dan kolom sensitif tidak disimpan.
- Jangan gunakan perangkat publik/bersama untuk memproses data pribadi siswa.
- Gunakan tombol **Hapus Data Lokal** setelah selesai mencetak atau sebelum menyerahkan perangkat ke orang lain.
- Akses operasional production diarahkan dari **Data Sekolah → Akun & Data Sekolah → Generator Kartu Tanda Pengenal** melalui `/admin/master-data/id-card-generator/`.
- Route legacy `/id-card-generator/` bukan akses utama lagi dan harus dilindungi server-side oleh Nginx `auth_request` sebelum menyajikan bundle generator.

## CSV Safety Rules

Kolom yang diterima untuk data kartu:

- `id`
- `nama`
- `tempat_lahir`
- `tanggal_lahir`
- `ttl`
- `nisn`
- `alamat`
- `kelas`
- `jurusan`
- `role`
- `status`
- `qr_value`
- `tahun_ajaran`
- `nomor_kartu`
- `createdAt`
- `updatedAt`

Aturan keamanan CSV:

- Jangan import CSV berisi `password`, `pass`, `pwd`, `username`, `token`, `secret`, `api_key`, `access_token`, `refresh_token`, `cookie`, `session`, `credential`, `auth`, `key`, `raw`, atau kolom rahasia lain.
- Jika CSV berisi kolom sensitif, aplikasi mengabaikan kolom tersebut dan hanya menampilkan nama kolomnya sebagai warning.
- Jika CSV berisi kolom tidak dikenal, kolom tersebut juga diabaikan.
- Warning tidak menampilkan nilai dari password/token/secret.

## Local Storage Policy

- localStorage hanya untuk penggunaan sementara saat operator membuat kartu.
- Jangan anggap localStorage sebagai database, backup, atau arsip resmi.
- Setelah PDF selesai dibuat dan diverifikasi, klik **Hapus Data Lokal**.
- Jika menggunakan perangkat non-pribadi, bersihkan data browser juga dari menu browser setelah selesai.
- Jika data lama pernah tersimpan sebelum hardening ini, aplikasi akan melakukan sanitasi saat load dan membuang field lama seperti `raw`, `username`, `password`, `token`, dan `secret`.

## QR Safety

- Jika kolom `qr_value` tersedia dan aman, nilai itu dipakai sebagai isi QR.
- Jika `qr_value` kosong/tidak ada, QR otomatis fallback ke nilai opaque lokal `schoolhub:qr:v1:QR_LOCAL_...` untuk draft/testing.
- QR tidak boleh berisi password, token, secret, cookie, session, API key, atau kredensial lain.
- Jika `qr_value` terlihat mengandung pola sensitif, aplikasi mengabaikannya dan fallback ke nilai opaque lokal tanpa menampilkan nilai sensitif di UI.

## Operator SOP

1. Pakai laptop/perangkat operator yang tepercaya.
2. Buka generator dari `/admin/master-data/id-card-generator/`; route legacy `/id-card-generator/` hanya boleh tetap hidup jika sudah dilindungi server-side.
3. Untuk kartu resmi, pilih **Ambil dari Data Sekolah** dari halaman Export.
4. Jika memakai CSV, perlakukan hasil sebagai draft/testing saja dan pastikan CSV tidak memuat password, token, secret, cookie, session, atau kredensial lain.
5. Preview kartu dan pastikan nama, NISN/username label, label role, QR, serta status `RESMI / DATABASE` atau `DRAFT / TIDAK TERVERIFIKASI` benar.
6. Export PDF/SVG dan cek hasil sebelum dicetak massal.
7. Setelah selesai, klik **Hapus Data Lokal**.
8. Jangan membagikan PDF/SVG mentah ke kanal publik.

## Menjalankan Project

```bash
npm install
npm run dev
npm run lint
npm run build
npm run preview
```

## Contoh CSV

```csv
nama,tempat_lahir,tanggal_lahir,nisn,alamat,kelas,qr_value
Ahmad Fauzan,Rokan Hulu,2010-02-14,1234567890,"Jl. Tuanku Tambusai, Pasir Pengaraian",X A,
Siti Rahma,Pekanbaru,12/08/2010,0987654321,"Desa Rambah Tengah Hulu",X B,schoolhub:qr:v1:QR_7F3K9X2P8LQ0
Budi Santoso,"",,"1122334455","Dusun Suka Maju",X C,
```

Alternatif dengan kolom TTL gabungan:

```csv
nama,Tempat Tanggal Lahir,nisn,alamat
Nur Aisyah,"Pekanbaru, 12 Agustus 2010",1231231231,"Jl. Diponegoro, Rokan Hulu"
Rafi Maulana,"Pekanbaru 12 Agustus 2010",3213213213,"Desa Rambah Hilir"
```

## Export PDF

- Ukuran kartu default: CR80 portrait `53.98mm x 85.60mm`.
- PDF output: A4 portrait.
- Layout: 3x3 kartu per halaman.
- Cut marks bersifat opsional dan bisa diaktifkan/nonaktifkan dari halaman export/generate.

## Known Limitations

- Protection production untuk route generator bergantung pada konfigurasi reverse proxy `auth_request`; jalankan `nginx -t` dan smoke akses role sebelum deploy.
- Vite build dapat memberi warning large chunks karena dependency PDF/export.
- Dependency audit lokal masih perlu follow-up jika alat ini akan dipakai luas dan rutin.
