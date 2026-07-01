import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileDown,
  Loader2,
  Printer,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Layout } from '../components/layout';
import IDCard from '../components/cards/IDCard';
import { useStore } from '../store/useStore';
import { getCardTemplate } from '../utils/cardTemplates';
import { getReadinessSummary } from '../utils/identityCard';
import { downloadPDF, generatePDF, printPDF } from '../utils/pdfGenerator';

const Export = () => {
  const { users, selectedUsers, getSelectedUsers, cardSettings } = useStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(null);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const candidates = selectedUsers.length > 0 ? getSelectedUsers() : users;
  const readiness = useMemo(() => getReadinessSummary(candidates), [candidates]);
  const template = getCardTemplate(cardSettings.cardSkin);
  const firstPreviewUser = readiness.validUsers[0] || candidates[0];
  const totalPages = Math.ceil(readiness.validCount / template.pdf.cardsPerPage) || 0;

  const buildFilename = () => {
    const date = new Date().toISOString().slice(0, 10);
    return `kartu-tanda-pengenal-siab2-${date}.pdf`;
  };

  const handleGeneratePDF = async () => {
    if (!readiness.validCount) {
      setError('Tidak ada data valid untuk export. Lengkapi nama, tempat tanggal lahir, NISN, alamat, dan QR.');
      return;
    }

    setIsGenerating(true);
    setProgress({ current: 0, total: readiness.validCount });
    setError('');
    setMessage('');

    try {
      const blob = await generatePDF(readiness.validUsers, {
        settings: cardSettings,
        title: 'Kartu Tanda Pengenal Resmi SIAB2',
        onProgress: (nextProgress) => setProgress(nextProgress),
      });

      setPdfBlob(blob);
      downloadPDF(blob, buildFilename());
      setMessage(`PDF berhasil dibuat: ${readiness.validCount} kartu dalam ${totalPages} halaman A4 portrait.`);
    } catch (generateError) {
      setError(generateError.message || 'Gagal membuat PDF.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    if (!pdfBlob) {
      setError('Generate PDF dulu sebelum print.');
      return;
    }

    printPDF(pdfBlob);
  };

  const progressPercent = progress?.total ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <Layout
      title="Export PDF Print-Ready"
      subtitle="Cetak massal kartu tanda pengenal resmi portrait SIAB2"
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-6">
          <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
            <div className="bg-[#071018] p-6 text-white">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#6fa6d8]/30 bg-[#6fa6d8]/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#b9dcf7]">
                <ShieldCheck className="h-3.5 w-3.5" />
                Print-ready portrait
              </div>
              <h2 className="mt-4 text-2xl font-black tracking-tight">Export Kartu Resmi</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Layout PDF mengikuti ukuran CR80 portrait {template.dimensions.widthMm}mm × {template.dimensions.heightMm}mm, 3 kolom × 3 baris pada A4.
              </p>
            </div>

            <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">Kandidat</p>
                <p className="mt-2 text-3xl font-black text-slate-950">{candidates.length}</p>
              </div>
              <div className="rounded-3xl bg-emerald-50 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Siap export</p>
                <p className="mt-2 text-3xl font-black text-emerald-800">{readiness.validCount}</p>
              </div>
              <div className="rounded-3xl bg-rose-50 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-rose-700">Belum lengkap</p>
                <p className="mt-2 text-3xl font-black text-rose-800">{readiness.invalidCount}</p>
              </div>
              <div className="rounded-3xl bg-[#eef7ff] p-4">
                <p className="text-xs font-black uppercase tracking-widest text-[#386f99]">Halaman A4</p>
                <p className="mt-2 text-3xl font-black text-[#173a55]">{totalPages}</p>
              </div>
            </div>
          </div>

          {selectedUsers.length > 0 && (
            <div className="rounded-3xl border border-[#6fa6d8]/30 bg-[#eef7ff] p-4 text-sm font-semibold text-[#173a55]">
              Mode pilihan aktif: export memakai {selectedUsers.length} data terpilih.
            </div>
          )}

          {readiness.invalidCount > 0 && (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" />
                <div>
                  <p className="font-black text-amber-950">Ada data belum lengkap</p>
                  <p className="mt-1 text-sm leading-6 text-amber-900">
                    Export hanya memakai data valid. Perbaiki data invalid di CSV/import agar semua kartu tercetak.
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-amber-900">
                    {readiness.invalidUsers.slice(0, 5).map((item) => (
                      <li key={`${item.row}-${item.user.id}`}>
                        <span className="font-bold">Baris {item.row}:</span> {item.errors.join(', ')}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">Aksi Export</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              PDF dibuat dari render kartu aktual agar preview dan hasil print konsisten. QR diexport sebagai PNG tajam.
            </p>

            {isGenerating && (
              <div className="mt-5 rounded-3xl border border-[#6fa6d8]/30 bg-[#eef7ff] p-4">
                <div className="mb-2 flex items-center justify-between text-sm font-bold text-[#173a55]">
                  <span>Membuat PDF...</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-[#6fa6d8] transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="mt-2 text-xs font-semibold text-[#386f99]">
                  {progress?.current || 0} / {progress?.total || readiness.validCount} kartu diproses
                </p>
              </div>
            )}

            {message && (
              <div className="mt-5 flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <p className="text-sm font-semibold leading-6">{message}</p>
              </div>
            )}

            {error && (
              <div className="mt-5 flex items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
                <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <p className="text-sm font-semibold leading-6">{error}</p>
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleGeneratePDF}
                disabled={isGenerating || !readiness.validCount}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#071018] px-5 py-3 text-sm font-black text-white transition hover:bg-[#13283a] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                {isGenerating ? 'Membuat PDF' : 'Generate & Download PDF'}
              </button>
              <button
                type="button"
                onClick={handlePrint}
                disabled={!pdfBlob || isGenerating}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Printer className="h-4 w-4" />
                Print PDF Terakhir
              </button>
              <Link
                to="/generate"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50"
              >
                Cek Preview
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#386f99]">Preview export</p>
                <h2 className="mt-1 font-black text-slate-950">Kartu pertama valid</h2>
              </div>
              <Download className="h-5 w-5 text-slate-400" />
            </div>

            {firstPreviewUser ? (
              <div className="mt-5 flex justify-center overflow-auto rounded-[28px] bg-[radial-gradient(circle_at_50%_0%,rgba(111,166,216,0.18),transparent_42%),linear-gradient(180deg,#0b1118,#05070a)] p-5">
                <IDCard user={firstPreviewUser} settings={cardSettings} scale={0.92} />
              </div>
            ) : (
              <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500">
                Belum ada data untuk preview.
              </div>
            )}
          </section>

          <section className="rounded-[32px] border border-[#6fa6d8]/30 bg-[#071018] p-6 text-white shadow-[0_24px_70px_rgba(2,8,23,0.22)]">
            <h2 className="font-black">Spesifikasi PDF</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                <dt className="text-slate-400">Ukuran kartu</dt>
                <dd className="font-bold">53.98 × 85.60 mm</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                <dt className="text-slate-400">Orientasi</dt>
                <dd className="font-bold">Portrait vertical</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                <dt className="text-slate-400">Layout A4</dt>
                <dd className="font-bold">3 × 3 kartu</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-400">Skin</dt>
                <dd className="font-bold">{template.label}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </Layout>
  );
};

export default Export;
