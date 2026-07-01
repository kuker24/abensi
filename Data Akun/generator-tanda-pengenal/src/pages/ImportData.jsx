import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileText,
  ShieldCheck,
  Trash2,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { Layout } from '../components/layout';
import { useStore } from '../store/useStore';
import { parseCSV, validateUsers } from '../utils/csvParser';

const REQUIRED_COLUMNS = [
  { field: 'nama', label: 'Nama', aliases: 'Nama, Nama Lengkap' },
  { field: 'tempat_lahir', label: 'Tempat lahir', aliases: 'Tempat Lahir, tempat' },
  { field: 'tanggal_lahir', label: 'Tanggal lahir', aliases: 'Tanggal Lahir, tgl_lahir' },
  { field: 'nisn', label: 'NISN', aliases: 'NISN, no_nisn' },
  { field: 'alamat', label: 'Alamat', aliases: 'Alamat, domisili' },
];

const OPTIONAL_COLUMNS = [
  'ttl / tempat_tanggal_lahir',
  'qr_value (bukan token/password/secret)',
  'kelas',
  'jurusan',
  'role',
  'tahun_ajaran',
  'nomor_kartu',
  'status',
];

const SAMPLE_CSV = [
  'nama,tempat_lahir,tanggal_lahir,nisn,alamat,kelas,qr_value',
  'Ahmad Fauzan,Rokan Hulu,2010-02-14,1234567890,"Jl. Tuanku Tambusai, Pasir Pengaraian",X A,',
  'Siti Rahma,Pekanbaru,12/08/2010,0987654321,"Desa Rambah Tengah Hulu",X B,https://verifikasi.example/siswa/0987654321',
].join('\n');

const ImportData = () => {
  const fileInputRef = useRef(null);
  const { setUsers, clearLocalData } = useStore();
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [file, setFile] = useState(null);
  const [parsedUsers, setParsedUsers] = useState([]);
  const [validationReport, setValidationReport] = useState(null);
  const [error, setError] = useState('');
  const [imported, setImported] = useState(false);
  const [privacyReport, setPrivacyReport] = useState(null);

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFile = async (selectedFile) => {
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setError('File harus berformat .csv');
      return;
    }

    setIsParsing(true);
    setFile(selectedFile);
    setError('');
    setImported(false);
    setPrivacyReport(null);

    try {
      const { users, privacyReport: nextPrivacyReport } = await parseCSV(selectedFile);
      const report = validateUsers(users);
      setParsedUsers(users);
      setValidationReport(report);
      setPrivacyReport(nextPrivacyReport);

      if (users.length === 0) {
        setError('CSV tidak berisi baris data yang bisa dibaca.');
      }
    } catch (parseError) {
      setParsedUsers([]);
      setValidationReport(null);
      setPrivacyReport(null);
      setError(parseError.message || 'Gagal membaca CSV. Periksa format file.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = useCallback((event) => {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  }, []);

  const handleFileSelect = (event) => {
    handleFile(event.target.files?.[0]);
  };

  const handleImport = () => {
    if (!validationReport?.validCount) {
      setError('Tidak ada data valid untuk diimport. Lengkapi field wajib terlebih dahulu.');
      return;
    }

    setUsers(validationReport.validUsers);
    setImported(true);
  };

  const handleClear = () => {
    setFile(null);
    setParsedUsers([]);
    setValidationReport(null);
    setPrivacyReport(null);
    setError('');
    setImported(false);
    clearLocalData();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'contoh-data-kartu-siab2.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const fileSize = file ? `${(file.size / 1024).toFixed(1)} KB` : '';
  const hasPrivacyWarnings = Boolean(
    privacyReport?.sensitiveColumns?.length ||
    privacyReport?.ignoredColumns?.length ||
    privacyReport?.qrSensitiveRows?.length
  );

  return (
    <Layout
      title="Import Data Siswa"
      subtitle="Masukkan data wajib untuk kartu tanda pengenal resmi vertikal SIAB2"
    >
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="min-w-0 space-y-4 lg:space-y-6">
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-black">Privasi data siswa</p>
                <p className="mt-1 text-sm leading-6">
                  Gunakan hanya file CSV resmi. Jangan impor kolom password, token, secret, cookie, atau data sensitif lain. Data tersimpan sementara di browser perangkat ini.
                </p>
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[32px] sm:p-6">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-[#071018] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#b9dcf7]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Format Resmi
                </div>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">Upload CSV Kartu Identitas</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Generator sekarang fokus ke kartu resmi portrait. Field wajib harus lengkap agar kartu bisa diexport.
                </p>
              </div>
              <button
                type="button"
                onClick={downloadSample}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                Contoh CSV
              </button>
            </div>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`rounded-[24px] border-2 border-dashed p-5 text-center transition sm:rounded-[28px] sm:p-8 ${
                isDragging
                  ? 'border-[#6fa6d8] bg-[#eef7ff]'
                  : 'border-slate-200 bg-slate-50 hover:border-[#6fa6d8] hover:bg-[#f6fbff]'
              }`}
            >
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-[#071018] text-[#9dccf1] shadow-[0_18px_45px_rgba(2,8,23,0.18)]">
                <UploadCloud className="h-8 w-8" />
              </div>
              <h3 className="mt-4 text-lg font-black text-slate-950">Tarik file CSV ke sini</h3>
              <p className="mt-2 text-sm text-slate-600">atau pilih file dari perangkat. Hanya .csv yang diproses.</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#6fa6d8] px-5 py-3 text-sm font-black text-[#061017] transition hover:bg-[#9dccf1] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isParsing}
              >
                {isParsing ? 'Membaca CSV...' : 'Pilih File CSV'}
              </button>
              {file && (
                <p className="mt-3 text-xs font-semibold text-slate-500">
                  File aktif: {file.name} · {fileSize}
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <p className="text-sm font-semibold leading-6">{error}</p>
            </div>
          )}

          {hasPrivacyWarnings && (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-black">Kolom berisiko sudah diabaikan</p>
                  <ul className="mt-2 space-y-1 text-sm leading-6 text-amber-900">
                    {privacyReport.sensitiveColumns.length > 0 && (
                      <li>Kolom sensitif diabaikan: <span className="font-bold">{privacyReport.sensitiveColumns.join(', ')}</span>.</li>
                    )}
                    {privacyReport.ignoredColumns.length > 0 && (
                      <li>Kolom tidak dikenal diabaikan: <span className="font-bold">{privacyReport.ignoredColumns.join(', ')}</span>.</li>
                    )}
                    {privacyReport.qrSensitiveRows.length > 0 && (
                      <li>QR berisi pola sensitif pada baris {privacyReport.qrSensitiveRows.join(', ')} diabaikan dan fallback ke NISN.</li>
                    )}
                  </ul>
                  <p className="mt-2 text-xs font-semibold text-amber-800">Peringatan hanya menampilkan nama kolom/baris, bukan isi CSV.</p>
                </div>
              </div>
            </div>
          )}

          {validationReport && (
            <div className="min-w-0 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[32px] sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-950">Hasil Validasi CSV</h2>
                  <p className="mt-1 text-sm text-slate-600">Data invalid tidak akan diimport diam-diam.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                    Total {validationReport.totalRows}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
                    Valid {validationReport.validCount}
                  </span>
                  <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-700">
                    Invalid {validationReport.invalidCount}
                  </span>
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                <div className="max-w-full overflow-x-auto">
                  <table className="min-w-[760px] divide-y divide-slate-200 text-sm sm:min-w-full">
                    <thead className="bg-slate-50 text-xs font-black uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-left">Nama</th>
                        <th className="px-4 py-3 text-left">TTL</th>
                        <th className="px-4 py-3 text-left">NISN</th>
                        <th className="px-4 py-3 text-left">Alamat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {parsedUsers.slice(0, 8).map((user) => {
                        const invalidRow = validationReport.invalidUsers.find((item) => item.user.id === user.id);
                        const isValid = !invalidRow;

                        return (
                          <tr key={user.id}>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${
                                isValid ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                              }`}>
                                {isValid ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                {isValid ? 'Valid' : 'Invalid'}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-950">{user.nama || '-'}</td>
                            <td className="px-4 py-3 text-slate-600">{user.ttl || '-'}</td>
                            <td className="px-4 py-3 font-mono font-bold text-slate-800">{user.nisn || '-'}</td>
                            <td className="max-w-[260px] px-4 py-3 text-slate-600">{user.alamat || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {validationReport.invalidUsers.length > 0 && (
                <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-4">
                  <p className="font-bold text-amber-950">Baris yang perlu diperbaiki:</p>
                  <ul className="mt-2 space-y-2 text-sm text-amber-900">
                    {validationReport.invalidUsers.slice(0, 6).map((item) => (
                      <li key={`${item.row}-${item.user.id}`}>
                        <span className="font-bold">Baris {item.row}:</span> {item.errors.join(', ')}
                      </li>
                    ))}
                  </ul>
                  {validationReport.invalidUsers.length > 6 && (
                    <p className="mt-2 text-sm font-semibold text-amber-900">
                      +{validationReport.invalidUsers.length - 6} baris invalid lainnya.
                    </p>
                  )}
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={!validationReport.validCount}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#071018] px-5 py-3 text-sm font-black text-white transition hover:bg-[#13283a] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Import {validationReport.validCount} Data Valid
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Hapus Data Lokal
                </button>
                {imported && (
                  <Link
                    to="/generate"
                    className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-700"
                  >
                    Lihat Preview Kartu
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>
          )}
        </section>

        <aside className="min-w-0 space-y-4 lg:space-y-6">
          <section className="min-w-0 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[32px] sm:p-6">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-[#386f99]" />
              <h2 className="font-black text-slate-950">Kolom Wajib</h2>
            </div>
            <div className="mt-4 space-y-3">
              {REQUIRED_COLUMNS.map((column) => (
                <div key={column.field} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-black text-slate-950">{column.label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Alias: {column.aliases}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="min-w-0 rounded-[28px] border border-[#6fa6d8]/30 bg-[#071018] p-4 text-white shadow-[0_24px_70px_rgba(2,8,23,0.22)] sm:rounded-[32px] sm:p-6">
            <h2 className="font-black">Kolom Opsional</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Field ini boleh ditambahkan tanpa mengganggu field wajib. Kolom lain akan diabaikan. QR akan memakai qr_value jika aman, kalau tidak fallback ke NISN.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {OPTIONAL_COLUMNS.map((column) => (
                <span key={column} className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs font-bold text-[#c6e1f7]">
                  {column}
                </span>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </Layout>
  );
};

export default ImportData;
