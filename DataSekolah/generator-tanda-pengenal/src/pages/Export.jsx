import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Printer,
  Download,
  Eye,
  CheckCircle,
  Loader2,
  AlertCircle,
  FileText,
  ArrowRight,
} from 'lucide-react';
import { Layout } from '../components/layout';
import IDCard from '../components/cards/IDCard';
import { CARD_PIXEL_HEIGHT, CARD_PIXEL_WIDTH, getQrPayload } from '../components/cards/cardConfig';
import { useStore } from '../store/useStore';
import { generatePDF, downloadPDF, getPrintLayout } from '../utils/pdfGenerator';
import { parseBackendQrExportText } from '../utils/csvParser';

const PREVIEW_SCALE = 0.7;
const THUMB_SCALE = 0.45;

const Export = () => {
  const { users, selectedUsers, getSelectedUsers, setUsers, addActivityLog } = useStore();
  const [searchParams] = useSearchParams();
  const layout = getPrintLayout();

  const usersToExport = selectedUsers.length > 0 ? getSelectedUsers() : users;

  const [isGenerating, setIsGenerating] = useState(false);
  const [isAutoLoading, setIsAutoLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [settings, setSettings] = useState({
    schoolName: 'MAN 1 Rokan Hulu',
    programName: 'e-Hadir Absensi',
  });

  const printRef = useRef(null);
  const exportScopeLabel = searchParams.get('classId') ? 'per-kelas' : searchParams.get('userId') ? 'cetak-ulang' : selectedUsers.length > 0 ? 'pilihan' : 'semua';
  const totalPages = Math.ceil(usersToExport.length / layout.cardsPerPage);
  const officialQrCount = usersToExport.filter((user) => getQrPayload(user).startsWith('schoolhub:qr:v1:')).length;
  const fallbackQrCount = usersToExport.length - officialQrCount;

  const downloadPdfForUsers = useCallback(async (targetUsers) => {
    if (!targetUsers.length) return;
    const officialCount = targetUsers.filter((user) => getQrPayload(user).startsWith('schoolhub:qr:v1:')).length;
    if (officialCount !== targetUsers.length) {
      setError('Masih ada QR fallback. Ambil QR resmi dulu sebelum cetak produksi.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setSuccess(false);
    setProgress({ current: 0, total: targetUsers.length });

    try {
      const blob = await generatePDF(targetUsers, {
        schoolName: settings.schoolName,
        programName: settings.programName,
        onProgress: (p) => setProgress(p),
      });

      const filename = `kartu-ehadir-${exportScopeLabel}-${new Date().toISOString().split('T')[0]}.pdf`;
      downloadPDF(blob, filename);

      setSuccess(true);
      addActivityLog(`Exported ${targetUsers.length} e-Hadir ID cards to PDF`);
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      setError(err.message || 'Gagal membuat PDF');
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  }, [addActivityLog, exportScopeLabel, settings.programName, settings.schoolName]);

  useEffect(() => {
    const autoLoad = searchParams.get('autoLoad') === '1';
    if (!autoLoad) return undefined;
    let cancelled = false;
    const classId = searchParams.get('classId');
    const userId = searchParams.get('userId');
    const autoPdf = searchParams.get('autoPdf') === '1';
    const endpoint = userId
      ? `/api/v1/qr-credentials/export/users/${encodeURIComponent(userId)}/card`
      : classId
        ? `/api/v1/qr-credentials/export/class/${encodeURIComponent(classId)}/cards`
        : '/api/v1/qr-credentials/export/cards';

    const run = async () => {
      setIsAutoLoading(true);
      setError(null);
      try {
        const response = await fetch(endpoint, { headers: { accept: 'application/json' }, credentials: 'include' });
        if (!response.ok) throw new Error(`Gagal mengambil data kartu resmi (HTTP ${response.status})`);
        const data = await response.json();
        const parsedUsers = parseBackendQrExportText(JSON.stringify(data));
        if (cancelled) return;
        setUsers(parsedUsers);
        if (autoPdf) await downloadPdfForUsers(parsedUsers);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Gagal mengambil data kartu resmi');
      } finally {
        if (!cancelled) setIsAutoLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [downloadPdfForUsers, searchParams, setUsers]);

  const handleGeneratePDF = () => downloadPdfForUsers(usersToExport);

  const handlePrint = () => window.print();

  return (
    <Layout title="Export PDF" subtitle="Download dan cetak kartu e-Hadir ukuran 5,5 × 8,5 cm">
      <div className="space-y-6">
        {isAutoLoading && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <Loader2 className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5 animate-spin" />
            <div>
              <p className="font-medium text-blue-800">Mengambil data kartu resmi...</p>
              <p className="text-sm text-primary-600 mt-1">Mohon tunggu, generator sedang memuat data dari backend SchoolHub.</p>
            </div>
          </div>
        )}

        {users.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-800">Belum ada data pengguna</p>
              <p className="text-sm text-yellow-600 mt-1">
                Import data CSV terlebih dahulu untuk membuat kartu tanda pengenal e-Hadir.
              </p>
              <Link
                to="/import"
                className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 bg-yellow-600 text-white text-sm rounded-lg hover:bg-yellow-700 transition-colors"
              >
                Import Data
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}

        {users.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Pengaturan Export</h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nama Madrasah</label>
                    <input
                      type="text"
                      value={settings.schoolName}
                      onChange={(e) => setSettings({ ...settings, schoolName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Program</label>
                    <input
                      type="text"
                      value={settings.programName}
                      onChange={(e) => setSettings({ ...settings, programName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Ringkasan Export</h3>

                <div className="space-y-3">
                  <Summary label="Jumlah Kartu" value={usersToExport.length} />
                  <Summary label="QR Resmi" value={officialQrCount} tone="text-primary-700" />
                  <Summary label="QR Fallback" value={fallbackQrCount} tone={fallbackQrCount ? 'text-red-600' : 'text-gray-900'} />
                  {usersToExport.length > 45 && (
                    <Summary label="Mode Proses" value={`${Math.ceil(usersToExport.length / 45)} Batch`} tone="text-blue-700" />
                  )}
                  <Summary label="Mode Cetak" value={exportScopeLabel} tone="text-blue-700" />
                  <Summary label="Jumlah Halaman" value={totalPages} />
                  <Summary label="Kartu per Halaman" value={layout.cardsPerPage} />
                  <Summary label="Ukuran Kartu" value="5,5 × 8,5 cm" tone="text-primary-700" />
                  <Summary label="Format File" value="A4 PDF" tone="text-primary-700" />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Aksi</h3>

                <div className="space-y-3">
                  <button
                    onClick={handleGeneratePDF}
                    disabled={isGenerating || usersToExport.length === 0 || fallbackQrCount > 0}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${fallbackQrCount ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700'}`}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Membuat PDF...
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5" />
                        {fallbackQrCount ? 'QR Resmi Belum Lengkap' : 'Download PDF'}
                      </>
                    )}
                  </button>

                  <button
                    onClick={handlePrint}
                    disabled={usersToExport.length === 0}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Printer className="w-5 h-5" />
                    Cetak Preview
                  </button>
                </div>

                {progress && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-gray-500">
                        {progress.totalBatches > 1 ? `Batch ${progress.batchProgress}` : 'Memproses...'}
                      </span>
                      <span className="text-gray-700">{progress.current}/{progress.total}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                      />
                    </div>
                    {progress.user && <p className="text-xs text-gray-400 mt-1 truncate">{progress.user}</p>}
                  </div>
                )}

                {success && (
                  <div className="mt-4 p-3 bg-primary-50 border border-green-200 rounded-lg flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-primary-500" />
                    <span className="text-sm text-green-700">PDF berhasil didownload!</span>
                  </div>
                )}

                {error && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <span className="text-sm text-red-700">{error}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Preview Layout</h3>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Eye className="w-4 h-4" />
                    Preview cetak A4
                  </div>
                </div>

                <div className="bg-gray-100 rounded-lg p-4 overflow-auto">
                  <div ref={printRef} className="bg-white rounded shadow mx-auto p-4" style={{ width: '595px', minHeight: '842px' }}>
                    <div className="bg-gradient-to-r from-primary-700 to-ink-800 text-white text-center py-3 rounded-lg mb-4">
                      <div className="text-sm font-bold tracking-wide uppercase">Kartu Identitas e-Hadir</div>
                      <div className="text-xs text-primary-100 mt-1">{settings.schoolName} | {settings.programName}</div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {usersToExport.slice(0, layout.cardsPerPage).map((user, index) => (
                        <div
                          key={user.id || index}
                          style={{ width: CARD_PIXEL_WIDTH * PREVIEW_SCALE, height: CARD_PIXEL_HEIGHT * PREVIEW_SCALE }}
                        >
                          <IDCard
                            user={user}
                            schoolName={settings.schoolName}
                            programName={settings.programName}
                            scale={PREVIEW_SCALE}
                          />
                        </div>
                      ))}
                      {usersToExport.length < layout.cardsPerPage &&
                        Array.from({ length: layout.cardsPerPage - usersToExport.length }).map((_, i) => (
                          <div
                            key={`empty-${i}`}
                            className="border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center bg-gray-50"
                            style={{ height: CARD_PIXEL_HEIGHT * PREVIEW_SCALE }}
                          >
                            <FileText className="w-8 h-8 text-gray-300" />
                          </div>
                        ))}
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 text-center text-xs text-gray-400">
                      Halaman 1 dari {totalPages}
                    </div>
                  </div>
                </div>

                <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="flex items-start gap-3">
                    <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${fallbackQrCount ? 'text-red-500' : 'text-blue-500'}`} />
                    <div className={`text-sm ${fallbackQrCount ? 'text-red-700' : 'text-blue-700'}`}>
                      <p className="font-semibold">Informasi Cetak:</p>
                      <ul className={`mt-2 space-y-1 ${fallbackQrCount ? 'text-red-600' : 'text-primary-600'}`}>
                        <li>• Ukuran kertas: A4 (210mm × 297mm)</li>
                        <li>• Layout: {layout.columns} kolom × {layout.rows} baris = {layout.cardsPerPage} kartu per halaman</li>
                        <li>• Ukuran kartu: 55mm × 85mm atau 5,5 × 8,5 cm</li>
                        <li>• PDF menampilkan tanda potong di tiap kartu agar hasil gunting presisi</li>
                        <li>• QR dibuat hitam-putih dengan error correction tinggi agar mudah discan</li>
                        {fallbackQrCount ? <li>• PERINGATAN: {fallbackQrCount} kartu belum memakai QR resmi. Tombol PDF produksi dikunci sampai data resmi diambil.</li> : <li>• Semua kartu memakai QR resmi SchoolHub.</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {usersToExport.length > layout.cardsPerPage && (
                <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Semua Kartu ({usersToExport.length})</h3>
                    <span className="text-sm text-gray-500">{totalPages} halaman</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {usersToExport.map((user, index) => (
                      <div key={user.id || index} className="text-center p-2 bg-gray-50 rounded-lg overflow-hidden">
                        <div style={{ width: CARD_PIXEL_WIDTH * THUMB_SCALE, height: CARD_PIXEL_HEIGHT * THUMB_SCALE, margin: '0 auto' }}>
                          <IDCard
                            user={user}
                            schoolName={settings.schoolName}
                            programName={settings.programName}
                            scale={THUMB_SCALE}
                          />
                        </div>
                        <p className="text-xs text-gray-600 mt-2 font-medium truncate">{user.nama}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

const Summary = ({ label, value, tone = 'text-gray-900' }) => (
  <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
    <span className="text-sm text-gray-600">{label}</span>
    <span className={`font-semibold ${tone}`}>{value}</span>
  </div>
);

export default Export;
