import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileCode2,
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
import { fetchSiab2Cards } from '../utils/siab2Cards';
import { downloadSVGCards } from '../utils/svgGenerator';

const Export = () => {
  const { users, selectedUsers, getSelectedUsers, cardSettings, setUsers, selectAllUsers } = useStore();
  const [searchParams] = useSearchParams();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingSvg, setIsGeneratingSvg] = useState(false);
  const [progress, setProgress] = useState(null);
  const [svgProgress, setSvgProgress] = useState(null);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [autoLoadStatus, setAutoLoadStatus] = useState({ loading: false, count: 0, source: '' });
  const [pendingAutoPdf, setPendingAutoPdf] = useState('');

  const autoLoadEnabled = searchParams.get('autoLoad') === '1';
  const autoPdfRequested = searchParams.get('autoPdf') === '1';
  const autoLoadClassId = searchParams.get('classId') || '';
  const autoLoadUserId = searchParams.get('userId') || '';
  const autoLoadKey = `${autoLoadUserId}|${autoLoadClassId}|${autoPdfRequested ? 'pdf' : 'preview'}`;

  const candidates = selectedUsers.length > 0 ? getSelectedUsers() : users;
  const readiness = useMemo(() => getReadinessSummary(candidates), [candidates]);
  const template = getCardTemplate(cardSettings.cardSkin);
  const firstPreviewUser = readiness.validUsers[0] || candidates[0];
  const totalPages = Math.ceil(readiness.validCount / template.pdf.cardsPerPage) || 0;

  const buildFilename = useCallback(() => {
    const date = new Date().toISOString().slice(0, 10);
    return `kartu-tanda-pengenal-siab2-${date}.pdf`;
  }, []);

  const generateAndDownloadPdf = useCallback(async (validUsers, pageCount) => {
    setIsGenerating(true);
    setProgress({ current: 0, total: validUsers.length });
    setError('');
    setMessage('');

    try {
      const blob = await generatePDF(validUsers, {
        settings: cardSettings,
        title: 'Kartu Digital Madrasah SIAB2',
        onProgress: (nextProgress) => setProgress(nextProgress),
      });

      setPdfBlob(blob);
      downloadPDF(blob, buildFilename());
      setMessage(`PDF berhasil dibuat: ${validUsers.length} kartu dalam ${pageCount} halaman A4 portrait.`);
    } catch (generateError) {
      setError(generateError.message || 'Gagal membuat PDF.');
    } finally {
      setIsGenerating(false);
    }
  }, [buildFilename, cardSettings]);

  const handleGeneratePDF = useCallback(async () => {
    if (!readiness.validCount) {
      setError('Tidak ada data valid untuk export. Lengkapi nama, NISN, dan QR.');
      return;
    }

    await generateAndDownloadPdf(readiness.validUsers, totalPages);
  }, [generateAndDownloadPdf, readiness.validCount, readiness.validUsers, totalPages]);

  const handleGenerateSVG = async () => {
    if (!readiness.validCount) {
      setError('Tidak ada data valid untuk export SVG. Lengkapi nama, NISN, dan QR.');
      return;
    }

    setIsGeneratingSvg(true);
    setSvgProgress({ current: 0, total: readiness.validCount });
    setError('');
    setMessage('');

    try {
      const total = await downloadSVGCards(readiness.validUsers, {
        settings: cardSettings,
        onProgress: (nextProgress) => setSvgProgress(nextProgress),
      });

      setMessage(`SVG berhasil dibuat: ${total} file kartu ukuran ${template.dimensions.widthMm}mm × ${template.dimensions.heightMm}mm, tanpa layout A4.`);
    } catch (generateError) {
      setError(generateError.message || 'Gagal membuat SVG.');
    } finally {
      setIsGeneratingSvg(false);
    }
  };

  const handlePrint = () => {
    if (!pdfBlob) {
      setError('Generate PDF dulu sebelum print.');
      return;
    }

    printPDF(pdfBlob);
  };

  useEffect(() => {
    if (!autoLoadEnabled) return undefined;
    let cancelled = false;

    const loadOfficialCards = async () => {
      setAutoLoadStatus({ loading: true, count: 0, source: 'SIAB2 API' });
      setError('');
      setMessage('Memuat data kartu resmi dari SIAB2...');

      try {
        const { payload, users: loadedUsers } = await fetchSiab2Cards({ classId: autoLoadClassId, userId: autoLoadUserId });
        if (cancelled) return;
        setUsers(loadedUsers);
        selectAllUsers();
        setAutoLoadStatus({ loading: false, count: loadedUsers.length, source: payload.source || 'SIAB2 API' });
        setMessage(`Data resmi SIAB2 dimuat: ${loadedUsers.length} kartu.`);
        if (autoPdfRequested) setPendingAutoPdf(autoLoadKey);
      } catch (loadError) {
        if (cancelled) return;
        setAutoLoadStatus({ loading: false, count: 0, source: 'SIAB2 API' });
        setError(loadError.message || 'Gagal memuat data kartu dari SIAB2. Pastikan sudah login sebagai Admin TU/Operator IT.');
      }
    };

    loadOfficialCards();

    return () => {
      cancelled = true;
    };
  }, [autoLoadClassId, autoLoadEnabled, autoLoadKey, autoLoadUserId, autoPdfRequested, selectAllUsers, setUsers]);

  useEffect(() => {
    if (!pendingAutoPdf || pendingAutoPdf !== autoLoadKey || !readiness.validCount || autoLoadStatus.loading || isGenerating) return;
    setPendingAutoPdf('');
    handleGeneratePDF();
  }, [autoLoadKey, autoLoadStatus.loading, handleGeneratePDF, isGenerating, pendingAutoPdf, readiness.validCount]);

  const progressPercent = progress?.total ? Math.round((progress.current / progress.total) * 100) : 0;
  const svgProgressPercent = svgProgress?.total ? Math.round((svgProgress.current / svgProgress.total) * 100) : 0;

  return (
    <Layout
      title="Export PDF / SVG Print-Ready"
      subtitle="Cetak massal A4 atau export SVG per kartu ukuran CR80 murni"
    >
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="min-w-0 space-y-4 lg:space-y-6">
          <div className="min-w-0 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm sm:rounded-[32px]">
            <div className="bg-[#071018] p-4 text-white sm:p-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#6fa6d8]/30 bg-[#6fa6d8]/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#b9dcf7]">
                <ShieldCheck className="h-3.5 w-3.5" />
                Print-ready portrait
              </div>
              <h2 className="mt-4 text-2xl font-black tracking-tight">Export Kartu Resmi</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                PDF mengikuti layout A4 3×3 untuk cetak massal. SVG menghasilkan file per kartu ukuran CR80 portrait {template.dimensions.widthMm}mm × {template.dimensions.heightMm}mm tanpa ditempatkan di kertas A4.
              </p>
            </div>

            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:gap-4 sm:p-6 lg:grid-cols-4">
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
                <p className="text-xs font-black uppercase tracking-widest text-[#386f99]">SVG kartu</p>
                <p className="mt-2 text-3xl font-black text-[#173a55]">{readiness.validCount}</p>
              </div>
            </div>
          </div>

          {selectedUsers.length > 0 && (
            <div className="rounded-3xl border border-[#6fa6d8]/30 bg-[#eef7ff] p-4 text-sm font-semibold text-[#173a55]">
              Mode pilihan aktif: export memakai {selectedUsers.length} data terpilih.
            </div>
          )}

          {autoLoadEnabled && (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
              {autoLoadStatus.loading ? 'Memuat data kartu resmi dari SIAB2...' : `Sumber: ${autoLoadStatus.source || 'SIAB2 API'} · ${autoLoadStatus.count} kartu dimuat.`}
            </div>
          )}

          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-black">Privasi sebelum mencetak</p>
                <p className="mt-1 text-sm leading-6">
                  Pastikan perangkat aman, jangan bagikan PDF/SVG mentah ke kanal publik, dan hapus data lokal setelah selesai mencetak.
                </p>
              </div>
            </div>
          </div>

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

          <div className="min-w-0 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[32px] sm:p-6">
            <h2 className="text-xl font-black text-slate-950">Aksi Export</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              PDF dibuat untuk A4 3×3. SVG dibuat per kartu sesuai ukuran CR80 asli, cocok untuk proses cetak kartu yang membutuhkan file ukuran kartu langsung.
            </p>

            {isGenerating && (
              <div className="mt-5 rounded-3xl border border-[#6fa6d8]/30 bg-[#eef7ff] p-4">
                <div className="mb-2 flex items-center justify-between text-sm font-bold text-[#173a55]">
                  <span>Membuat PDF A4...</span>
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

            {isGeneratingSvg && (
              <div className="mt-5 rounded-3xl border border-[#6fa6d8]/30 bg-[#eef7ff] p-4">
                <div className="mb-2 flex items-center justify-between text-sm font-bold text-[#173a55]">
                  <span>Membuat SVG per kartu...</span>
                  <span>{svgProgressPercent}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-[#6fa6d8] transition-all"
                    style={{ width: `${svgProgressPercent}%` }}
                  />
                </div>
                <p className="mt-2 text-xs font-semibold text-[#386f99]">
                  {svgProgress?.current || 0} / {svgProgress?.total || readiness.validCount} file SVG dibuat
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
                disabled={isGenerating || isGeneratingSvg || !readiness.validCount}
                className="inline-flex min-w-0 items-center gap-2 rounded-2xl bg-[#071018] px-4 py-3 text-sm font-black text-white transition hover:bg-[#13283a] disabled:cursor-not-allowed disabled:opacity-50 sm:px-5"
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                {isGenerating ? 'Membuat PDF' : 'Generate & Download PDF A4'}
              </button>
              <button
                type="button"
                onClick={handleGenerateSVG}
                disabled={isGenerating || isGeneratingSvg || !readiness.validCount}
                className="inline-flex min-w-0 items-center gap-2 rounded-2xl bg-[#0d3047] px-4 py-3 text-sm font-black text-white transition hover:bg-[#173a55] disabled:cursor-not-allowed disabled:opacity-50 sm:px-5"
              >
                {isGeneratingSvg ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCode2 className="h-4 w-4" />}
                {isGeneratingSvg ? 'Membuat SVG' : 'Download SVG Kartu'}
              </button>
              <button
                type="button"
                onClick={handlePrint}
                disabled={!pdfBlob || isGenerating || isGeneratingSvg}
                className="inline-flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:px-5"
              >
                <Printer className="h-4 w-4" />
                Print PDF Terakhir
              </button>
              <Link
                to="/generate"
                className="inline-flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 sm:px-5"
              >
                Cek Preview
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        <aside className="min-w-0 space-y-4 lg:space-y-6">
          <section className="min-w-0 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[32px] sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#386f99]">Preview export</p>
                <h2 className="mt-1 font-black text-slate-950">Kartu pertama valid</h2>
              </div>
              <Download className="h-5 w-5 text-slate-400" />
            </div>

            {firstPreviewUser ? (
              <div className="mt-5 max-w-full overflow-auto rounded-[24px] bg-[radial-gradient(circle_at_50%_0%,rgba(111,166,216,0.18),transparent_42%),linear-gradient(180deg,#0b1118,#05070a)] p-2 sm:rounded-[28px] sm:p-4 lg:flex lg:justify-center lg:p-5">
                <IDCard user={firstPreviewUser} settings={cardSettings} scale={0.92} />
              </div>
            ) : (
              <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500">
                Belum ada data untuk preview.
              </div>
            )}
          </section>

          <section className="min-w-0 rounded-[28px] border border-[#6fa6d8]/30 bg-[#071018] p-4 text-white shadow-[0_24px_70px_rgba(2,8,23,0.22)] sm:rounded-[32px] sm:p-6">
            <h2 className="font-black">Spesifikasi Output</h2>
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
                <dt className="text-slate-400">PDF A4</dt>
                <dd className="font-bold">3 × 3 kartu</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                <dt className="text-slate-400">SVG kartu</dt>
                <dd className="font-bold">1 file/kartu</dd>
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
