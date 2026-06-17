import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, Filter, ChevronLeft, ChevronRight,
  Users as UsersIcon, GraduationCap, BookOpen,
  CheckSquare, Square, Trash2, ArrowRight, FileText,
  CreditCard, Download, X, CheckCircle2, QrCode,
  Eye, CalendarCheck, UserCheck,
} from 'lucide-react';
import { Layout } from '../components/layout';
import IDCard from '../components/cards/IDCard';
import { useStore } from '../store/useStore';
import { getUniqueClasses } from '../utils/csvParser';
import { getQrPayload } from '../components/cards/cardConfig';
import { downloadPDF, generatePDF } from '../utils/pdfGenerator';

const ITEMS_PER_PAGE = 15;
const OFFICIAL_QR_PREFIX = 'schoolhub:qr:v1:';

const Users = () => {
  const {
    users, selectedUsers, toggleUserSelection, deselectAllUsers,
    deleteUser, clearUsers, getStats,
  } = useStore();

  const stats = getStats();
  const uniqueClasses = getUniqueClasses(users);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Preview modal
  const [previewUser, setPreviewUser] = useState(null);
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [bulkSuccess, setBulkSuccess] = useState(null);

  // Filtered users
  const filteredUsers = useMemo(() => {
    let result = [...users];
    if (roleFilter) result = result.filter((u) => u.role === roleFilter);
    if (classFilter) result = result.filter((u) => u.kelas === classFilter);
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      result = result.filter(
        (u) => u.nama?.toLowerCase().includes(search) || u.username?.toLowerCase().includes(search)
      );
    }
    return result;
  }, [users, roleFilter, classFilter, searchTerm]);

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredUsers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredUsers, currentPage]);

  const allFilteredSelected = filteredUsers.length > 0 && filteredUsers.every((u) => selectedUsers.includes(u.id));

  const handleSelectAll = () => {
    if (allFilteredSelected) {
      // Deselect only filtered users
      const filteredIds = new Set(filteredUsers.map((u) => u.id));
      const remaining = selectedUsers.filter((id) => !filteredIds.has(id));
      deselectAllUsers();
      remaining.forEach((id) => toggleUserSelection(id));
    } else {
      const ids = filteredUsers.map((u) => u.id);
      ids.forEach((id) => {
        if (!selectedUsers.includes(id)) toggleUserSelection(id);
      });
    }
  };

  const handleDeleteSelected = () => {
    if (window.confirm(`Hapus ${selectedUsers.length} pengguna terpilih?`)) {
      selectedUsers.forEach((id) => deleteUser(id));
    }
  };

  const handleClearAll = () => {
    if (window.confirm('Hapus semua data pengguna?')) {
      clearUsers();
    }
  };

  const handleBulkGenerateCards = async () => {
    const selected = users.filter((u) => selectedUsers.includes(u.id));
    if (!selected.length) return;
    setIsBulkGenerating(true);
    setBulkSuccess(null);
    try {
      await new Promise((r) => setTimeout(r, 600));
      setBulkSuccess(`Kartu untuk ${selected.length} pengguna siap dibuat. Lanjut ke halaman Export.`);
      setTimeout(() => setBulkSuccess(null), 6000);
    } finally {
      setIsBulkGenerating(false);
    }
  };

  const handleBulkExportSelected = async () => {
    const selected = users.filter((u) => selectedUsers.includes(u.id));
    if (!selected.length) return;
    const fallbackCount = selected.filter((u) => !getQrPayload(u).startsWith(OFFICIAL_QR_PREFIX)).length;
    if (fallbackCount > 0) {
      alert(`${fallbackCount} kartu masih QR fallback. Ambil QR resmi dulu.`);
      return;
    }
    setIsBulkGenerating(true);
    try {
      const blob = await generatePDF(selected, { schoolName: 'MAN 1 Rokan Hulu', programName: 'SIAB2' });
      downloadPDF(blob, `kartu-ehadir-bulk-${selected.length}-${new Date().toISOString().split('T')[0]}.pdf`);
      setBulkSuccess(`${selected.length} kartu berhasil diekspor!`);
      setTimeout(() => setBulkSuccess(null), 6000);
    } catch (e) {
      alert('Gagal membuat PDF: ' + e.message);
    } finally {
      setIsBulkGenerating(false);
    }
  };

  const handleFilterChange = (setter) => (e) => { setter(e.target.value); setCurrentPage(1); };

  const getRoleBadge = (role) => {
    if (role === 'teacher' || role === 'staff') {
      return { label: 'Guru/Pegawai', class: 'bg-primary-50 text-primary-700 border border-primary-200' };
    }
    return { label: 'Siswa', class: 'bg-sky-50 text-sky-700 border border-sky-200' };
  };

  const getQrStatus = (user) => {
    const isOfficial = getQrPayload(user).startsWith(OFFICIAL_QR_PREFIX);
    return {
      official: isOfficial,
      label: isOfficial ? 'QR Resmi' : 'Fallback',
      class: isOfficial ? 'bg-primary-50 text-primary-700 border border-primary-200' : 'bg-amber-50 text-amber-700 border border-amber-200',
    };
  };

  return (
    <Layout title="Data Pengguna" subtitle={`${stats.totalUsers} pengguna terdaftar`}>
      <div className="space-y-6">
        {/* ===== Premium Stat Cards ===== */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalUsers}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
                <UsersIcon className="w-5 h-5 text-sky-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Siswa</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalStudents}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-primary-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pegawai</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalTeachers + (stats.totalStaff || 0)}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-violet-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Dipilih</p>
                <p className={`text-2xl font-bold mt-1 ${stats.selectedCount > 0 ? 'text-primary-600' : 'text-gray-900'}`}>
                  {stats.selectedCount}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <CheckSquare className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </div>
        </div>

        {/* ===== Bulk Actions Bar ===== */}
        {selectedUsers.length > 0 && (
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3 text-white">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-primary-400" />
              </div>
              <div>
                <p className="font-semibold text-sm">{selectedUsers.length} pengguna terpilih</p>
                <p className="text-xs text-white/60">Pilih aksi untuk pengguna yang dipilih</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleBulkGenerateCards}
                disabled={isBulkGenerating}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <CreditCard className="w-4 h-4" />
                {isBulkGenerating ? 'Memproses...' : 'Buat Kartu'}
              </button>
              <button
                onClick={handleBulkExportSelected}
                disabled={isBulkGenerating}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {isBulkGenerating ? 'Memproses...' : 'Export PDF'}
              </button>
              <button
                onClick={handleDeleteSelected}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Hapus
              </button>
              <button
                onClick={deselectAllUsers}
                className="inline-flex items-center gap-2 px-3 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg text-sm transition-colors"
              >
                <X className="w-4 h-4" />
                Batal
              </button>
            </div>
          </div>
        )}

        {/* ===== Filters ===== */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Cari nama atau username..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
              />
            </div>
            <div className="w-full md:w-48">
              <select
                value={roleFilter}
                onChange={handleFilterChange(setRoleFilter)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm bg-white"
              >
                <option value="">Semua Role</option>
                <option value="student">Siswa</option>
                <option value="teacher">Guru</option>
                <option value="staff">Pegawai/Admin</option>
              </select>
            </div>
            <div className="w-full md:w-48">
              <select
                value={classFilter}
                onChange={handleFilterChange(setClassFilter)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm bg-white"
              >
                <option value="">Semua Kelas</option>
                {uniqueClasses.map((kelas) => (
                  <option key={kelas} value={kelas}>{kelas}</option>
                ))}
              </select>
            </div>
            {(searchTerm || roleFilter || classFilter) && (
              <button
                onClick={() => { setSearchTerm(''); setRoleFilter(''); setClassFilter(''); setCurrentPage(1); }}
                className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* ===== Table ===== */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Table Header Toolbar */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <div className="flex items-center gap-4">
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                {allFilteredSelected ? (
                  <CheckSquare className="w-5 h-5 text-primary-600" />
                ) : (
                  <Square className="w-5 h-5" />
                )}
                {allFilteredSelected ? 'Batal Pilih Semua' : 'Pilih Semua'}
              </button>
              <span className="text-sm text-gray-400">
                {filteredUsers.length} dari {users.length} pengguna
              </span>
            </div>
            <div className="flex items-center gap-2">
              {selectedUsers.length > 0 && (
                <span className="text-sm text-primary-600 font-medium">{selectedUsers.length} dipilih</span>
              )}
              {users.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="flex items-center gap-2 px-3 py-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  Hapus Semua
                </button>
              )}
            </div>
          </div>

          {/* Table Content */}
          {users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-lg font-semibold text-gray-600">Belum ada data</p>
              <p className="text-sm text-gray-400 mb-5">Import data CSV untuk memulai</p>
              <Link
                to="/import"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
              >
                Import Data
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
                <Filter className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-lg font-semibold text-gray-600">Tidak ada hasil</p>
              <p className="text-sm text-gray-400">Coba ubah filter pencarian</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-100">
                      <th className="w-12 px-4 py-3"></th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Nama</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Username</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Kelas/Jabatan</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">QR Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paginatedUsers.map((user) => {
                      const roleBadge = getRoleBadge(user.role);
                      const qrStatus = getQrStatus(user);
                      const isSelected = selectedUsers.includes(user.id);
                      return (
                        <tr
                          key={user.id}
                          className={`group hover:bg-gray-50/80 transition-colors ${isSelected ? 'bg-primary-50/60' : ''}`}
                        >
                          <td className="px-4 py-3">
                            <button
                              onClick={() => toggleUserSelection(user.id)}
                              className="text-gray-400 hover:text-primary-600 transition-colors"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-5 h-5 text-primary-600" />
                              ) : (
                                <Square className="w-5 h-5" />
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                user.role === 'teacher' || user.role === 'staff'
                                  ? 'bg-primary-100 text-primary-700'
                                  : 'bg-sky-100 text-sky-700'
                              }`}>
                                {(user.nama || user.username || 'U').charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-semibold text-gray-900 text-sm">{user.nama}</p>
                                <p className="text-xs text-gray-400">{user.idNumber || user.username}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-gray-600 font-mono">{user.username}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2.5 py-1 text-xs font-semibold rounded-full ${roleBadge.class}`}>
                              {roleBadge.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-gray-600">{user.kelas || '-'}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full ${qrStatus.class}`}>
                              <QrCode className="w-3 h-3" />
                              {qrStatus.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 text-sm text-primary-600">
                              <span className="w-2 h-2 bg-primary-500 rounded-full"></span>
                              {user.status || 'Aktif'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => setPreviewUser(user)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Preview
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredUsers.length)} dari {filteredUsers.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) pageNum = i + 1;
                    else if (currentPage <= 3) pageNum = i + 1;
                    else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                    else pageNum = currentPage - 2 + i;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                          currentPage === pageNum
                            ? 'bg-primary-600 text-white shadow-sm'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ===== Bottom CTA ===== */}
        {selectedUsers.length > 0 && (
          <div className="flex justify-end">
            <Link
              to="/generate"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium shadow-sm"
            >
              <CreditCard className="w-4 h-4" />
              Buat Kartu untuk {selectedUsers.length} Pengguna
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* ===== Success Toast ===== */}
        {bulkSuccess && (
          <div className="fixed bottom-6 right-6 z-50 bg-primary-600 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-fadeIn">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-medium">{bulkSuccess}</span>
          </div>
        )}

        {/* ===== Preview Modal ===== */}
        {previewUser && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setPreviewUser(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-5 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Preview Kartu</h3>
                    <p className="text-sm text-gray-500">{previewUser.nama}</p>
                  </div>
                </div>
                <button
                  onClick={() => setPreviewUser(null)}
                  className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 flex flex-col md:flex-row gap-6 items-start">
                <div className="flex-1 flex justify-center">
                  <div className="scale-90 origin-top">
                    <IDCard
                      user={previewUser}
                      schoolName="MAN 1 Rokan Hulu"
                      programName="SIAB2"
                      scale={1.1}
                    />
                  </div>
                </div>
                <div className="flex-1 space-y-4 min-w-[240px]">
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-700">Informasi Pengguna</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Nama</span>
                        <span className="font-medium text-gray-900">{previewUser.nama}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Username</span>
                        <span className="font-medium text-gray-900 font-mono">{previewUser.username}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Role</span>
                        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${getRoleBadge(previewUser.role).class}`}>
                          {getRoleBadge(previewUser.role).label}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Kelas/Level</span>
                        <span className="font-medium text-gray-900">{previewUser.kelas || '-'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-700">Status QR</h4>
                    <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${getQrStatus(previewUser).class}`}>
                      <QrCode className="w-4 h-4" />
                      {getQrStatus(previewUser).label}
                    </div>
                    <p className="text-xs text-gray-500">
                      {getQrStatus(previewUser).official
                        ? 'Kartu ini menggunakan QR resmi dari backend SIAB2.'
                        : 'Kartu ini masih menggunakan QR fallback. Ambil QR resmi untuk cetak produksi.'}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Link
                      to="/generate"
                      onClick={() => setPreviewUser(null)}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
                    >
                      <CreditCard className="w-4 h-4" />
                      Buat Kartu
                    </Link>
                    <button
                      onClick={() => {
                        if (!selectedUsers.includes(previewUser.id)) toggleUserSelection(previewUser.id);
                        setPreviewUser(null);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                    >
                      <CheckSquare className="w-4 h-4" />
                      Pilih
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Users;
