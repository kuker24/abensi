import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Users as UsersIcon,
  GraduationCap,
  BookOpen,
  CheckSquare,
  Square,
  Trash2,
  ArrowRight,
  FileText,
} from 'lucide-react';
import { Layout } from '../components/layout';
import { useStore } from '../store/useStore';
import { getUniqueClasses } from '../utils/csvParser';

const ITEMS_PER_PAGE = 15;

const Users = () => {
  const {
    users,
    selectedUsers,
    toggleUserSelection,
    deselectAllUsers,
    deleteUser,
    clearUsers,
    getStats,
  } = useStore();
  
  const stats = getStats();
  const uniqueClasses = getUniqueClasses(users);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  // Filtered users
  const filteredUsers = useMemo(() => {
    let result = [...users];
    
    if (roleFilter) {
      result = result.filter((u) => u.role === roleFilter);
    }
    
    if (classFilter) {
      result = result.filter((u) => u.kelas === classFilter);
    }
    
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      result = result.filter(
        (u) =>
          u.nama?.toLowerCase().includes(search) ||
          u.username?.toLowerCase().includes(search)
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
  
  // Selection handlers
  const handleSelectAll = () => {
    const allSelected = filteredUsers.every((u) => selectedUsers.includes(u.id));
    if (allSelected) {
      deselectAllUsers();
    } else {
      const ids = filteredUsers.map((u) => u.id);
      ids.forEach((id) => {
        if (!selectedUsers.includes(id)) {
          toggleUserSelection(id);
        }
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
  
  // Reset page when filters change
  const handleFilterChange = (setter) => (e) => {
    setter(e.target.value);
    setCurrentPage(1);
  };
  
  const isAllSelected = paginatedUsers.length > 0 && 
    paginatedUsers.every((u) => selectedUsers.includes(u.id));

  return (
    <Layout title="Data Pengguna" subtitle={`${stats.totalUsers} pengguna terdaftar`}>
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <UsersIcon className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total</p>
                <p className="text-xl font-bold text-gray-900">{stats.totalUsers}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <GraduationCap className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Siswa</p>
                <p className="text-xl font-bold text-gray-900">{stats.totalStudents}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <BookOpen className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Guru</p>
                <p className="text-xl font-bold text-gray-900">{stats.totalTeachers}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <CheckSquare className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Dipilih</p>
                <p className="text-xl font-bold text-gray-900">{stats.selectedCount}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Cari nama atau username..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            
            {/* Role Filter */}
            <div className="w-full md:w-48">
              <select
                value={roleFilter}
                onChange={handleFilterChange(setRoleFilter)}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="">Semua Role</option>
                <option value="student">Siswa</option>
                <option value="teacher">Guru</option>
              </select>
            </div>
            
            {/* Class Filter */}
            <div className="w-full md:w-48">
              <select
                value={classFilter}
                onChange={handleFilterChange(setClassFilter)}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="">Semua Kelas</option>
                {uniqueClasses.map((kelas) => (
                  <option key={kelas} value={kelas}>{kelas}</option>
                ))}
              </select>
            </div>
            
            {/* Clear Filters */}
            {(searchTerm || roleFilter || classFilter) && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setRoleFilter('');
                  setClassFilter('');
                  setCurrentPage(1);
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Table Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center gap-4">
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
              >
                {isAllSelected ? (
                  <CheckSquare className="w-5 h-5 text-primary-600" />
                ) : (
                  <Square className="w-5 h-5" />
                )}
                {isAllSelected ? 'Batalkan Pilihan' : 'Pilih Semua'}
              </button>
              <span className="text-sm text-gray-500">
                {filteredUsers.length} dari {users.length} pengguna
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              {selectedUsers.length > 0 && (
                <button
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Hapus ({selectedUsers.length})
                </button>
              )}
              {users.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="flex items-center gap-2 px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Hapus Semua
                </button>
              )}
            </div>
          </div>

          {/* Table Content */}
          {users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <FileText className="w-16 h-16 mb-4" />
              <p className="text-lg font-medium">Belum ada data</p>
              <p className="text-sm mb-4">Import data CSV untuk memulai</p>
              <Link
                to="/import"
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                Import Data
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Filter className="w-16 h-16 mb-4" />
              <p className="text-lg font-medium">Tidak ada hasil</p>
              <p className="text-sm">Coba ubah filter pencarian</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="w-12 px-4 py-3"></th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Nama
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Username
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Kelas/Jabatan
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedUsers.map((user) => (
                      <tr
                        key={user.id}
                        className={`hover:bg-gray-50 transition-colors ${
                          selectedUsers.includes(user.id) ? 'bg-primary-50' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleUserSelection(user.id)}
                            className="text-gray-400 hover:text-primary-600"
                          >
                            {selectedUsers.includes(user.id) ? (
                              <CheckSquare className="w-5 h-5 text-primary-600" />
                            ) : (
                              <Square className="w-5 h-5" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{user.nama}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-gray-600">{user.username}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                              user.role === 'teacher'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {user.role === 'teacher' ? 'Guru' : 'Siswa'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-gray-600">{user.kelas || '-'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-green-600 text-sm">
                            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                            {user.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  Menampilkan {(currentPage - 1) * ITEMS_PER_PAGE + 1} -{' '}
                  {Math.min(currentPage * ITEMS_PER_PAGE, filteredUsers.length)} dari{' '}
                  {filteredUsers.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                          currentPage === pageNum
                            ? 'bg-primary-600 text-white'
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
                    className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        {selectedUsers.length > 0 && (
          <div className="flex justify-end">
            <Link
              to="/generate"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Buat Kartu untuk {selectedUsers.length} Pengguna
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Users;
