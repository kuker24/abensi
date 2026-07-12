import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Eye,
  Trash2,
  ArrowRight,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { Layout } from '../components/layout';
import { useStore } from '../store/useStore';
import { parseBackendQrExportText, parseDataFile, validateUsers } from '../utils/csvParser';
import { getCsrfToken } from '../utils/csrf';
import { bulkGenerateMissingQr } from '../utils/backendQr';

const ImportData = () => {
  const navigate = useNavigate();
  const { setUsers, mergeUsersByUsername, users, addActivityLog } = useStore();
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showManualImport, setShowManualImport] = useState(false);
  const [parseResult, setParseResult] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const applyUsers = (parsedUsers) => {
    const shouldMergeQr = users.length > 0 && parsedUsers.some((user) => user.source === 'backend-qr-export' || user.qrCode);

    if (shouldMergeQr) {
      mergeUsersByUsername(parsedUsers);
      addActivityLog(`Merged ${parsedUsers.length} QR records into existing users`);
    } else if (users.length > 0) {
      setUsers(parsedUsers);
      addActivityLog(`Replaced ${users.length} users with ${parsedUsers.length} new users`);
    } else {
      setUsers(parsedUsers);
    }
  };

  const loadParsedUsers = (parsedUsers, fileName, fileSizeLabel = 'server') => {
    const validation = validateUsers(parsedUsers);

    setParseResult({
      fileName,
      fileSize: fileSizeLabel,
      ...validation,
    });
    setPreviewData(parsedUsers.slice(0, 10));
  };

  const handleFile = async (file) => {
    // Validate file type
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.csv') && !fileName.endsWith('.json')) {
      setError('File harus berformat CSV atau JSON export QR backend');
      return;
    }

    setIsLoading(true);
    setError(null);
    setParseResult(null);
    setPreviewData(null);

    try {
      // Parse CSV utama atau JSON export QR backend
      const parsedUsers = await parseDataFile(file);
      
      loadParsedUsers(parsedUsers, file.name, formatFileSize(file.size));
      
    } catch (err) {
      setError(err.message || 'Gagal membaca file data');
    } finally {
      setIsLoading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleImport = () => {
    if (parseResult && parseResult.validUsers.length > 0) {
      applyUsers(parseResult.validUsers);

      setParseResult(null);
      setPreviewData(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFetchBackendQr = async (ensureMissing = false, autoUse = false) => {
    setIsLoading(true);
    setError(null);
    setParseResult(null);
    setPreviewData(null);

    try {
      if (ensureMissing) {
        const csrfToken = await getCsrfToken();
        await bulkGenerateMissingQr(csrfToken);
      }

      const response = await fetch('/api/v1/qr-credentials/export/cards', {
        headers: { accept: 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) throw new Error(`Gagal mengambil JSON QR backend (HTTP ${response.status}). Buka generator dari web admin yang sudah login.`);
      const data = await response.json();
      const parsedUsers = parseBackendQrExportText(JSON.stringify(data));
      loadParsedUsers(parsedUsers, ensureMissing ? 'Backend QR resmi + generate missing' : 'Backend QR resmi', `${data.count || parsedUsers.length} kartu`);
      if (autoUse) {
        applyUsers(parsedUsers);
        navigate('/export');
      }
    } catch (err) {
      setError(err.message || 'Gagal mengambil QR resmi dari backend');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setParseResult(null);
    setPreviewData(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Layout title="Import Data" subtitle="Upload CSV utama atau JSON QR resmi dari backend SIAB2">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Upload Area */}
        <div
          className={`drop-zone p-8 bg-white rounded-xl border-2 ${
            isDragging ? 'border-primary-500 bg-primary-50' : 'border-gray-200'
          } transition-all duration-200`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json,application/json,text/csv"
            onChange={handleFileSelect}
            className="hidden"
            id="csv-upload"
          />
          
          <div className="text-center">
            {isLoading ? (
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mb-4" />
                <p className="text-gray-600">Memproses file...</p>
              </div>
            ) : (
              <>
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-8 h-8 text-primary-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Drag & Drop File CSV / JSON
                </h3>
                <p className="text-gray-500 mb-4">
                  atau klik untuk memilih file
                </p>
                <div className="flex flex-col items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleFetchBackendQr(true, true)}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-xl font-semibold shadow-sm hover:bg-primary-700 transition-colors"
                  >
                    <ArrowRight className="w-5 h-5" />
                    Ambil Data Resmi & Lanjut Export
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowManualImport((value) => !value)}
                    className="text-sm font-medium text-gray-500 hover:text-gray-700"
                  >
                    {showManualImport ? 'Sembunyikan opsi manual' : 'Tampilkan opsi manual CSV/JSON'}
                  </button>
                  {showManualImport && (
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                      <label
                        htmlFor="csv-upload"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg cursor-pointer hover:bg-primary-700 transition-colors"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        Pilih File CSV / JSON
                      </label>
                      <button
                        type="button"
                        onClick={() => handleFetchBackendQr(false)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        Ambil QR Resmi
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFetchBackendQr(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Lengkapi QR & Ambil
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-4">
                  Untuk cetak produksi, gunakan tombol utama agar semua kartu memakai QR resmi backend.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">Gagal Import</p>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          </div>
        )}

        {/* Parse Result */}
        {parseResult && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* File Info */}
            <div className="p-4 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary-100 rounded-lg">
                    <FileText className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{parseResult.fileName}</p>
                    <p className="text-sm text-gray-500">{parseResult.fileSize}</p>
                  </div>
                </div>
                <button
                  onClick={handleClear}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Validation Summary */}
            <div className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-4">
                <ValidationCard label="Total" value={parseResult.totalRows} />
                <ValidationCard label="Valid" value={parseResult.validCount} tone="green" />
                <ValidationCard label="Tidak Valid" value={parseResult.invalidCount} tone={parseResult.invalidCount ? 'red' : 'gray'} />
                <ValidationCard label="QR Resmi" value={parseResult.officialQrCount || 0} tone="green" />
                <ValidationCard label="QR Fallback" value={parseResult.fallbackQrCount || 0} tone={parseResult.fallbackQrCount ? 'yellow' : 'gray'} />
                <ValidationCard label="ID Duplikat" value={parseResult.duplicateUsernameCount || 0} tone={parseResult.duplicateUsernameCount ? 'red' : 'gray'} />
              </div>

              {(parseResult.fallbackQrCount > 0 || parseResult.missingLevelCount > 0) && (
                <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                  {parseResult.fallbackQrCount > 0 && <p>• {parseResult.fallbackQrCount} data belum memakai QR resmi. Ambil/import JSON backend sebelum cetak produksi.</p>}
                  {parseResult.missingLevelCount > 0 && <p>• {parseResult.missingLevelCount} data belum punya kelas/jabatan/level.</p>}
                </div>
              )}

              {/* Invalid Users */}
              {parseResult.invalidUsers.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    <p className="text-sm font-medium text-gray-700">
                      Baris dengan error ({parseResult.invalidUsers.length})
                    </p>
                  </div>
                  <div className="max-h-40 overflow-y-auto bg-yellow-50 rounded-lg p-3">
                    {parseResult.invalidUsers.map((item) => (
                      <div key={item.row} className="text-sm mb-2 last:mb-0">
                        <span className="font-medium text-yellow-800">Baris {item.row}:</span>
                        <span className="text-yellow-700"> {item.errors.join(', ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview Table */}
              {previewData && previewData.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="w-4 h-4 text-gray-400" />
                    <p className="text-sm font-medium text-gray-700">
                      Preview Data (10 baris pertama)
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Nama</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Username</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Role</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Kelas/Jabatan</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">QR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.map((user, index) => (
                          <tr key={index} className="border-t border-gray-100">
                            <td className="px-3 py-2 text-gray-900">{user.nama}</td>
                            <td className="px-3 py-2 text-gray-600">{user.username}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                                user.role === 'teacher' || user.role === 'staff'
                                  ? 'bg-primary-100 text-primary-700'
                                  : 'bg-blue-100 text-blue-700'
                              }`}>
                                {user.displayRole || (user.role === 'teacher' ? 'Guru' : user.role === 'staff' ? 'Pegawai' : 'Siswa')}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-600">{user.kelas || '-'}</td>
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center gap-1 text-primary-600">
                                <CheckCircle className="w-3 h-3" />
                                {user.status}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${user.qrCode?.startsWith('schoolhub:qr:v1:') ? 'bg-primary-100 text-primary-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {user.qrCode?.startsWith('schoolhub:qr:v1:') ? 'Resmi' : 'Fallback'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  {parseResult.validCount} data siap diimport
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleClear}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={parseResult.validCount === 0}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Import Data
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CSV Format Guide */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Format File CSV / JSON Backend</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Kolom yang Diperlukan:</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary-500" />
                  <span><strong>Nama Lengkap</strong> - Nama lengkap dengan gelar</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary-500" />
                  <span><strong>Username</strong> - Username login</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary-500" />
                  <span><strong>Role</strong> - Guru, Siswa, atau Pegawai/Admin</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary-500" />
                  <span><strong>Kelas/Jabatan</strong> - Kelas atau jabatan</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary-500" />
                  <span><strong>Status</strong> - Opsional, default Aktif</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary-500" />
                  <span><strong>QR Code</strong> - Opsional, isi credential QR resmi jika tersedia</span>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Contoh CSV:</h4>
              <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs overflow-x-auto">
                <pre className="text-gray-600">{`No,Role,Nama Lengkap,Username,Kelas/Jabatan,Password,Status,QR Code
1,Guru,"ADRIYA,S.Pd",adriyaspd.4369,"AHLI PERTAMA - GURU SENI BUDAYA",********,Aktif,QR_RESMI_DARI_BACKEND
2,Siswa,"AHMAD FAUZI",ahmad.1234,"X A",********,Aktif,`}</pre>
              </div>
              <h4 className="text-sm font-medium text-gray-700 mt-4 mb-2">JSON Backend Resmi:</h4>
              <p className="text-sm text-gray-600">
                Bisa langsung import file JSON hasil endpoint <code className="px-1 py-0.5 bg-gray-100 rounded">/qr-credentials/export/cards</code>.
                Field <strong>qrCode</strong> dari backend akan dicetak sebagai QR absensi resmi.
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        {users.length > 0 && (
          <div className="flex justify-end">
            <Link
              to="/users"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Lihat Data Pengguna
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </Layout>
  );
};

const ValidationCard = ({ label, value, tone = 'gray' }) => {
  const toneClass = {
    gray: 'bg-gray-50 text-gray-900',
    green: 'bg-primary-50 text-primary-600',
    yellow: 'bg-yellow-50 text-yellow-700',
    red: 'bg-red-50 text-red-600',
  }[tone] || 'bg-gray-50 text-gray-900';

  return (
    <div className={`text-center p-3 rounded-lg ${toneClass}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm opacity-80">{label}</p>
    </div>
  );
};

export default ImportData;
