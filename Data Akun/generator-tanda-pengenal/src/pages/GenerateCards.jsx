import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Eye,
  FileDown,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { Layout } from '../components/layout';
import IDCard from '../components/cards/IDCard';
import { useStore } from '../store/useStore';
import { getCardTemplate, getCardTemplateOptions } from '../utils/cardTemplates';
import { getReadinessSummary, validateCardUser } from '../utils/identityCard';

const GenerateCards = () => {
  const {
    users,
    selectedUsers,
    getSelectedUsers,
    getStats,
    cardSettings,
    updateCardSettings,
    clearLocalData,
  } = useStore();
  const stats = getStats();
  const [showSettings, setShowSettings] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  const usersToGenerate = selectedUsers.length > 0 ? getSelectedUsers() : users;
  const safeIndex = usersToGenerate.length > 0 ? Math.min(currentIndex, usersToGenerate.length - 1) : 0;
  const currentUser = usersToGenerate[safeIndex];
  const readiness = getReadinessSummary(usersToGenerate);
  const currentValidation = currentUser ? validateCardUser(currentUser) : { isValid: false, errors: [] };
  const validUserIds = new Set(readiness.validUsers.map((user) => user.id));
  const template = getCardTemplate(cardSettings.cardSkin);
  const templateOptions = getCardTemplateOptions();

  const handlePrev = () => setCurrentIndex((prev) => Math.max(0, prev - 1));
  const handleNext = () => setCurrentIndex((prev) => Math.min(usersToGenerate.length - 1, prev + 1));
  const updateSettings = (key, value) => updateCardSettings({ [key]: value });

  return (
    <Layout
      title="Generate Kartu Tanda Pengenal"
      subtitle="Preview kartu resmi portrait SIAB2 sebelum export PDF print-ready"
    >
      <div className="space-y-6">
        {users.length === 0 && (
          <div className="overflow-hidden rounded-3xl border border-amber-200 bg-amber-50 shadow-sm">
            <div className="flex items-start gap-4 p-5">
              <AlertCircle className="mt-0.5 h-6 w-6 flex-shrink-0 text-amber-600" />
              <div>
                <p className="font-bold text-amber-950">Belum ada data siswa</p>
                <p className="mt-1 text-sm leading-6 text-amber-800">
                  Import CSV dengan kolom wajib: nama, tempat_lahir, tanggal_lahir, nisn, dan alamat.
                </p>
                <Link
                  to="/import"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-amber-800"
                >
                  Import Data
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {users.length > 0 && (
          <div className="grid min-w-0 grid-cols-1 gap-4 lg:gap-6 xl:grid-cols-[360px_1fr]">
            <aside className="min-w-0 space-y-4">
              <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => setShowSettings((value) => !value)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-slate-50"
                >
                  <span className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#071018] text-[#9dccf1]">
                      <Settings className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block font-bold text-slate-950">Pengaturan Kartu</span>
                      <span className="text-xs font-medium text-slate-500">Skin, tahun ajaran, dan cut mark</span>
                    </span>
                  </span>
                  <ChevronRight className={`h-5 w-5 text-slate-400 transition ${showSettings ? 'rotate-90' : ''}`} />
                </button>

                {showSettings && (
                  <div className="space-y-4 border-t border-slate-100 p-4 sm:p-5">
                    <div>
                      <label className="mb-1.5 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                        Skin kartu
                      </label>
                      <select
                        value={cardSettings.cardSkin}
                        onChange={(event) => updateSettings('cardSkin', event.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#6fa6d8] focus:ring-4 focus:ring-[#6fa6d8]/20"
                      >
                        {templateOptions.map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </select>
                      <p className="mt-2 text-xs leading-5 text-slate-500">{template.description}</p>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                        Nama madrasah
                      </label>
                      <input
                        type="text"
                        value={cardSettings.schoolName}
                        onChange={(event) => updateSettings('schoolName', event.target.value)}
                        className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#6fa6d8] focus:ring-4 focus:ring-[#6fa6d8]/20"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                          Brand
                        </label>
                        <input
                          type="text"
                          value={cardSettings.brandName}
                          onChange={(event) => updateSettings('brandName', event.target.value)}
                          className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#6fa6d8] focus:ring-4 focus:ring-[#6fa6d8]/20"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                          Tahun ajaran
                        </label>
                        <input
                          type="text"
                          value={cardSettings.academicYear}
                          onChange={(event) => updateSettings('academicYear', event.target.value)}
                          className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#6fa6d8] focus:ring-4 focus:ring-[#6fa6d8]/20"
                        />
                      </div>
                    </div>

                    <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <span>
                        <span className="block text-sm font-bold text-slate-950">Cut marks PDF</span>
                        <span className="text-xs text-slate-500">Tanda bantu potong saat print A4.</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={Boolean(cardSettings.showCutMarks)}
                        onChange={(event) => updateSettings('showCutMarks', event.target.checked)}
                        className="h-5 w-5 rounded border-slate-300 text-[#386f99] focus:ring-[#6fa6d8]"
                      />
                    </label>
                  </div>
                )}
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <Users className="h-5 w-5 text-[#386f99]" />
                  <h2 className="font-bold text-slate-950">Ringkasan Operasional</h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-xs font-bold text-slate-500">Total data</p>
                    <p className="mt-1 text-2xl font-black text-slate-950">{stats.totalUsers}</p>
                  </div>
                  <div className="rounded-2xl bg-[#eef7ff] p-3">
                    <p className="text-xs font-bold text-[#386f99]">Akan dibuat</p>
                    <p className="mt-1 text-2xl font-black text-[#173a55]">{usersToGenerate.length}</p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 p-3">
                    <p className="text-xs font-bold text-emerald-700">Siap generate</p>
                    <p className="mt-1 text-2xl font-black text-emerald-800">{readiness.validCount}</p>
                  </div>
                  <div className="rounded-2xl bg-rose-50 p-3">
                    <p className="text-xs font-bold text-rose-700">Belum lengkap</p>
                    <p className="mt-1 text-2xl font-black text-rose-800">{readiness.invalidCount}</p>
                  </div>
                </div>
                {selectedUsers.length > 0 && (
                  <p className="mt-3 rounded-2xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white">
                    Mode pilihan aktif: {selectedUsers.length} data terpilih.
                  </p>
                )}
              </section>

              <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-sm">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0" />
                  <div>
                    <p className="font-bold">Data tersimpan di browser ini</p>
                    <p className="mt-1 text-xs leading-5 text-amber-900">Selesai preview/export? Hapus data lokal agar tidak tertinggal di perangkat operator.</p>
                    <button
                      type="button"
                      onClick={clearLocalData}
                      className="mt-3 inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-900 transition hover:bg-amber-100"
                    >
                      <Trash2 className="h-4 w-4" />
                      Hapus Data Lokal
                    </button>
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4">
                  <p className="font-bold text-slate-950">Daftar Preview</p>
                  <p className="text-xs text-slate-500">Pilih data untuk melihat kartu portrait.</p>
                </div>
                <div className="max-h-[420px] overflow-y-auto">
                  {usersToGenerate.map((user, index) => {
                    const isReady = validUserIds.has(user.id);
                    const isActive = index === safeIndex;

                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => setCurrentIndex(index)}
                        className={`flex w-full items-center gap-3 border-l-4 px-4 py-3 text-left transition hover:bg-slate-50 ${
                          isActive ? 'border-[#6fa6d8] bg-[#eef7ff]' : 'border-transparent'
                        }`}
                      >
                        <span className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-2xl ${
                          isReady ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {isReady ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-slate-950">{user.nama || 'Nama belum diisi'}</span>
                          <span className="block truncate text-xs font-medium text-slate-500">NISN {user.nisn || 'belum diisi'}</span>
                        </span>
                        {isActive && <Eye className="h-4 w-4 text-[#386f99]" />}
                      </button>
                    );
                  })}
                </div>
              </section>
            </aside>

            <section className="min-w-0 rounded-[28px] border border-slate-800 bg-[#05080b] p-3 shadow-[0_24px_80px_rgba(2,8,23,0.28)] sm:rounded-[32px] sm:p-5 lg:p-7">
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#6fa6d8]/30 bg-[#6fa6d8]/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#b9dcf7]">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Portrait Official
                  </div>
                  <h2 className="mt-3 text-2xl font-black tracking-tight text-white">Preview Kartu Resmi</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    Default CR80 portrait {template.dimensions.widthMm}mm × {template.dimensions.heightMm}mm, siap untuk export A4.
                  </p>
                </div>

                <Link
                  to="/export"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#6fa6d8] px-4 py-2.5 text-sm font-black text-[#061017] transition hover:bg-[#9dccf1]"
                >
                  Export PDF
                  <FileDown className="h-4 w-4" />
                </Link>
              </div>

              {currentUser ? (
                <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(360px,430px)_1fr] lg:gap-6">
                  <div className="max-w-full overflow-auto rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_50%_0%,rgba(111,166,216,0.18),transparent_42%),linear-gradient(180deg,#0b1118,#05070a)] p-2 sm:rounded-[28px] sm:p-4 lg:flex lg:justify-center lg:p-6">
                    <IDCard user={currentUser} settings={cardSettings} />
                  </div>

                  <div className="min-w-0 space-y-4">
                    <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 text-white sm:p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8fb9d8]">Data aktif</p>
                          <h3 className="mt-2 text-xl font-black">{currentUser.nama || 'Nama belum diisi'}</h3>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${
                          currentValidation.isValid ? 'bg-emerald-400/15 text-emerald-200' : 'bg-rose-400/15 text-rose-200'
                        }`}>
                          {currentValidation.isValid ? 'SIAP' : 'BELUM LENGKAP'}
                        </span>
                      </div>

                      <dl className="mt-5 grid gap-3 text-sm">
                        <div className="rounded-2xl bg-white/[0.05] p-3">
                          <dt className="text-xs font-bold uppercase tracking-widest text-slate-400">NISN</dt>
                          <dd className="mt-1 font-mono font-black text-white">{currentUser.nisn || '-'}</dd>
                        </div>
                        <div className="rounded-2xl bg-white/[0.05] p-3">
                          <dt className="text-xs font-bold uppercase tracking-widest text-slate-400">Alamat</dt>
                          <dd className="mt-1 leading-6 text-white/86">{currentUser.alamat || '-'}</dd>
                        </div>
                      </dl>

                      {!currentValidation.isValid && (
                        <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-400/10 p-3">
                          <p className="text-sm font-bold text-rose-100">Perlu dilengkapi sebelum export:</p>
                          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-rose-100/85">
                            {currentValidation.errors.map((error) => (
                              <li key={error}>{error}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-3 sm:p-4">
                      <button
                        type="button"
                        onClick={handlePrev}
                        disabled={safeIndex === 0}
                        className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Sebelumnya
                      </button>
                      <span className="text-sm font-bold text-slate-400">
                        {safeIndex + 1} / {usersToGenerate.length}
                      </span>
                      <button
                        type="button"
                        onClick={handleNext}
                        disabled={safeIndex === usersToGenerate.length - 1}
                        className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Berikutnya
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>

                    {readiness.invalidCount > 0 && (
                      <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                          <p>
                            Ada {readiness.invalidCount} data belum lengkap. Export PDF hanya aman jika semua field wajib sudah terisi.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-10 text-center text-slate-300">
                  <CreditCard className="mx-auto h-10 w-10 text-[#8fb9d8]" />
                  <p className="mt-4 font-bold">Belum ada kartu untuk dipreview.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default GenerateCards;
