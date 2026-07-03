import { Link } from 'react-router-dom';
import {
  Users,
  GraduationCap,
  BookOpen,
  School,
  Upload,
  CreditCard,
  Clock,
  CheckCircle,
  AlertCircle,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Layout } from '../components/layout';
import { useStore } from '../store/useStore';

const Dashboard = () => {
  const { users, activityLog, getStats, clearLocalData } = useStore();
  const stats = getStats();

  const statCards = [
    {
      title: 'Total Pengguna',
      value: stats.totalUsers,
      icon: Users,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600',
    },
    {
      title: 'Siswa',
      value: stats.totalStudents,
      icon: GraduationCap,
      color: 'bg-green-500',
      bgColor: 'bg-green-50',
      textColor: 'text-green-600',
    },
    {
      title: 'Guru',
      value: stats.totalTeachers,
      icon: BookOpen,
      color: 'bg-purple-500',
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-600',
    },
    {
      title: 'Kelas',
      value: stats.totalClasses,
      icon: School,
      color: 'bg-orange-500',
      bgColor: 'bg-orange-50',
      textColor: 'text-orange-600',
    },
  ];

  const quickActions = [
    {
      title: 'Ambil Data Sekolah',
      description: 'Muat kartu resmi DB-backed dari data SIAB2',
      icon: CreditCard,
      href: '/export',
      color: 'bg-green-500 hover:bg-green-600',
    },
    {
      title: 'Import CSV Draft',
      description: 'Upload CSV hanya untuk draft layout/testing',
      icon: Upload,
      href: '/import',
      color: 'bg-primary-500 hover:bg-primary-600',
    },
  ];

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Layout title="Dashboard" subtitle="Ringkasan data dan aktivitas">
      <div className="space-y-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-bold">Privasi data lokal</p>
                <p className="mt-1 text-sm leading-6">
                  Data siswa tersimpan sementara di browser perangkat ini. Gunakan perangkat aman dan hapus data lokal setelah kartu selesai dicetak.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={clearLocalData}
              disabled={users.length === 0 && activityLog.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-black text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Hapus Data Lokal
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat, index) => (
            <div
              key={stat.title}
              className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 card-hover animate-fadeIn"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">{stat.title}</p>
                  <p className={`text-3xl font-bold mt-1 ${stat.textColor}`}>
                    {stat.value.toLocaleString('id-ID')}
                  </p>
                </div>
                <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                  <stat.icon className={`w-6 h-6 ${stat.textColor}`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions & Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick Actions */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Aksi Cepat</h2>
              <div className="space-y-3">
                {quickActions.map((action) => (
                  <Link
                    key={action.title}
                    to={action.href}
                    className={`flex items-center gap-4 p-4 rounded-xl text-white transition-all duration-200 ${action.color}`}
                  >
                    <div className="p-2 bg-white/20 rounded-lg">
                      <action.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium">{action.title}</p>
                      <p className="text-sm text-white/80">{action.description}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Status */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Status Sistem</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="text-sm text-gray-700">Database</span>
                  </div>
                  <span className="text-xs font-medium text-green-600">Aktif</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-blue-500" />
                    <span className="text-sm text-gray-700">Storage</span>
                  </div>
                  <span className="text-xs font-medium text-blue-600">Tersedia</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-yellow-500" />
                    <span className="text-sm text-gray-700">Data Tersimpan</span>
                  </div>
                  <span className="text-xs font-medium text-yellow-600">
                    {users.length > 0 ? `${users.length} pengguna` : 'Belum ada'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Activity Log */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Aktivitas Terbaru</h2>
                <Clock className="w-5 h-5 text-gray-400" />
              </div>
              
              {activityLog.length > 0 ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {activityLog.slice(0, 10).map((activity, index) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg animate-slideIn"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className="w-2 h-2 mt-2 bg-primary-500 rounded-full flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700">{activity.message}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {formatTime(activity.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                  <Clock className="w-12 h-12 mb-3" />
                  <p className="text-sm">Belum ada aktivitas</p>
                  <p className="text-xs mt-1">Aktivitas akan muncul di sini</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Getting Started Guide */}
        {users.length === 0 && (
          <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-xl p-6 text-white">
            <h2 className="text-xl font-semibold mb-2">Memulai dengan ID Card Generator</h2>
            <p className="text-primary-100 mb-4">
              Ikuti langkah-langkah berikut untuk membuat kartu tanda pengenal peserta ujian:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="font-bold">1</span>
                </div>
                <div>
                  <p className="font-medium">Import Data</p>
                  <p className="text-sm text-primary-200">Upload file CSV berisi data pengguna</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="font-bold">2</span>
                </div>
                <div>
                  <p className="font-medium">Pilih Pengguna</p>
                  <p className="text-sm text-primary-200">Pilih pengguna untuk dibuatkan kartu</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="font-bold">3</span>
                </div>
                <div>
                  <p className="font-medium">Export PDF</p>
                  <p className="text-sm text-primary-200">Download atau cetak kartu dalam format PDF</p>
                </div>
              </div>
            </div>
            <Link
              to="/import"
              className="inline-flex items-center gap-2 mt-6 px-4 py-2 bg-white text-primary-700 rounded-lg font-medium hover:bg-primary-50 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Mulai Import Data
            </Link>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Dashboard;
