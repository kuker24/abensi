import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCard,
  Users,
  ChevronLeft,
  ChevronRight,
  Settings,
  Eye,
  FileDown,
  ArrowRight,
  AlertCircle,
  QrCode,
} from 'lucide-react';
import { Layout } from '../components/layout';
import IDCard from '../components/cards/IDCard';
import { CARD_PIXEL_HEIGHT, CARD_PIXEL_WIDTH } from '../components/cards/cardConfig';
import { useStore } from '../store/useStore';
import { getPrintLayout } from '../utils/pdfGenerator';

const roleInitial = (role) => (role === 'teacher' || role === 'staff' ? 'P' : 'S');
const roleLabel = (role) => (role === 'teacher' ? 'Guru/Pegawai' : role === 'staff' ? 'Pegawai' : 'Siswa');

const GenerateCards = () => {
  const { users, selectedUsers, getSelectedUsers, getStats } = useStore();
  const stats = getStats();
  const layout = getPrintLayout();

  const usersToGenerate = selectedUsers.length > 0 ? getSelectedUsers() : users;

  const [settings, setSettings] = useState({
    schoolName: 'MAN 1 Rokan Hulu',
    programName: 'SIAB2',
    showSettings: false,
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const currentUser = usersToGenerate[currentIndex];

  const handlePrev = () => setCurrentIndex((prev) => Math.max(0, prev - 1));
  const handleNext = () => setCurrentIndex((prev) => Math.min(usersToGenerate.length - 1, prev + 1));
  const updateSettings = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }));

  return (
    <Layout title="Buat Kartu SIAB2" subtitle="Preview kartu identitas absensi tanpa foto">
      <div className="space-y-6">
        {users.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-800">Belum ada data pengguna</p>
              <p className="text-sm text-yellow-600 mt-1">
                Import file CSV utama dari folder DataSekolah terlebih dahulu untuk membuat kartu.
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
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <button
                  onClick={() => updateSettings('showSettings', !settings.showSettings)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Settings className="w-5 h-5 text-gray-400" />
                    <span className="font-medium text-gray-900">Pengaturan Kartu</span>
                  </div>
                  <ChevronRight
                    className={`w-5 h-5 text-gray-400 transition-transform ${
                      settings.showSettings ? 'rotate-90' : ''
                    }`}
                  />
                </button>

                {settings.showSettings && (
                  <div className="p-4 pt-0 space-y-4 border-t border-gray-100">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nama Madrasah</label>
                      <input
                        type="text"
                        value={settings.schoolName}
                        onChange={(e) => updateSettings('schoolName', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Program</label>
                      <input
                        type="text"
                        value={settings.programName}
                        onChange={(e) => updateSettings('programName', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center gap-3 mb-4">
                  <Users className="w-5 h-5 text-gray-400" />
                  <span className="font-medium text-gray-900">Ringkasan</span>
                </div>
                <div className="space-y-3">
                  <Summary label="Total Pengguna" value={stats.totalUsers} />
                  <Summary label="Dipilih" value={stats.selectedCount} tone="text-primary-600" />
                  <Summary label="Akan Dibuat" value={usersToGenerate.length} tone="text-primary-600" />
                  <Summary label="QR Resmi" value={stats.officialQrCount} tone="text-primary-700" />
                  <Summary label="QR Fallback" value={stats.fallbackQrCount} tone={stats.fallbackQrCount ? 'text-red-600' : 'text-gray-900'} />
                  <Summary label="Ukuran Kartu" value="5,5 × 8,5 cm" tone="text-primary-700" />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                  <span className="font-medium text-gray-900">Daftar Kartu</span>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {usersToGenerate.map((user, index) => (
                    <button
                      key={user.id}
                      onClick={() => setCurrentIndex(index)}
                      className={`w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors ${
                        index === currentIndex ? 'bg-primary-50 border-l-2 border-primary-500' : ''
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          user.role === 'teacher' || user.role === 'staff'
                            ? 'bg-primary-100 text-primary-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {roleInitial(user.role)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{user.nama}</p>
                        <p className="text-xs text-gray-500 truncate">{user.kelas || user.username}</p>
                      </div>
                      {index === currentIndex && <Eye className="w-4 h-4 text-primary-500" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Preview Kartu</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePrev}
                      disabled={currentIndex === 0}
                      className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="text-sm text-gray-500">{currentIndex + 1} / {usersToGenerate.length}</span>
                    <button
                      onClick={handleNext}
                      disabled={currentIndex === usersToGenerate.length - 1}
                      className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {currentUser && (
                  <div className="flex justify-center overflow-auto py-2">
                    <div
                      className="relative"
                      style={{ width: CARD_PIXEL_WIDTH * 1.2, height: CARD_PIXEL_HEIGHT * 1.2 }}
                    >
                      <div className="absolute inset-0 rounded-[24px] bg-gradient-to-br from-primary-400/20 to-ink-600/20 blur-xl" />
                      <div className="relative">
                        <IDCard
                          user={currentUser}
                          schoolName={settings.schoolName}
                          programName={settings.programName}
                          scale={1.2}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {currentUser && (
                  <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <Info label="Nama" value={currentUser.nama} />
                      <Info label="ID" value={currentUser.username} />
                      <Info label="Role" value={roleLabel(currentUser.role)} />
                      <Info label="Kelas/Level" value={currentUser.kelas || '-'} />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200">
                  <p className="text-sm text-gray-500">{usersToGenerate.length} kartu siap untuk diexport</p>
                  <Link
                    to="/export"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    <FileDown className="w-4 h-4" />
                    Lanjut ke Export
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>

              <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Layout Cetak (A4)</h3>
                <div className="bg-gray-100 rounded-lg p-4">
                  <div className="bg-white rounded shadow-sm p-2 mx-auto" style={{ maxWidth: '300px' }}>
                    <div className="grid grid-cols-3 gap-1">
                      {Array.from({ length: layout.cardsPerPage }).map((_, i) => (
                        <div
                          key={i}
                          className="bg-gradient-to-b from-primary-500 to-ink-700 rounded aspect-[55/85] flex items-center justify-center"
                        >
                          <CreditCard className="w-4 h-4 text-white/60" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-center text-xs text-gray-500 mt-2">
                    {layout.cardsPerPage} kartu per halaman A4 ({layout.columns} kolom × {layout.rows} baris)
                  </p>
                </div>
              </div>

              <div className={`mt-6 rounded-xl p-4 flex items-start gap-3 border ${stats.fallbackQrCount ? 'bg-red-50 border-red-100' : 'bg-primary-50 border-primary-100'}`}>
                <QrCode className={`w-5 h-5 flex-shrink-0 mt-0.5 ${stats.fallbackQrCount ? 'text-red-600' : 'text-primary-600'}`} />
                <div className={`text-sm ${stats.fallbackQrCount ? 'text-red-800' : 'text-primary-800'}`}>
                  <p className="font-semibold">Status QR:</p>
                  <p className="mt-1">
                    {stats.fallbackQrCount
                      ? `${stats.fallbackQrCount} kartu masih memakai QR fallback. Import JSON backend resmi atau klik Ambil QR Resmi sebelum cetak produksi.`
                      : 'Semua kartu sudah memakai QR resmi SIAB2 dan siap dicetak untuk absensi.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

const Summary = ({ label, value, tone = 'text-gray-900' }) => (
  <div className="flex items-center justify-between">
    <span className="text-sm text-gray-500">{label}</span>
    <span className={`font-medium ${tone}`}>{value}</span>
  </div>
);

const Info = ({ label, value }) => (
  <div>
    <p className="text-gray-500">{label}</p>
    <p className="font-medium text-gray-900 break-words">{value}</p>
  </div>
);

export default GenerateCards;
