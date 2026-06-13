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
} from 'lucide-react';
import { Layout } from '../components/layout';
import { useStore } from '../store/useStore';

const Dashboard = () => {
  const { users, activityLog, getStats } = useStore();
  const stats = getStats();

  const statCards = [
    {
      title: 'Total Pengguna',
      value: stats.totalUsers,
      icon: Users,
      color: 'bg-primary-500',
      bgColor: 'bg-primary-50',
      textColor: 'text-primary-700',
    },
    {
      title: 'Siswa',
      value: stats.totalStudents,
      icon: GraduationCap,
      color: 'bg-amber-500',
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-700',
    },
    {
      title: 'Pegawai/Guru',
      value: stats.totalTeachers + (stats.totalStaff || 0),
      icon: BookOpen,
      color: 'bg-warm-600',
      bgColor: 'bg-warm-50',
      textColor: 'text-warm-700',
    },
    {
      title: 'Kelas',
      value: stats.totalClasses,
      icon: School,
      color: 'bg-rose-500',
      bgColor: 'bg-rose-50',
      textColor: 'text-orange-600',
    },
  ];

  const quickActions = [
    {
      title: 'Import Data CSV',
      description: 'Upload file CSV untuk mengimpor data pengguna',
      icon: Upload,
      href: '/import',
      color: 'bg-primary-500 hover:bg-primary-600',
    },
    {
      title: 'Buat Kartu e-Hadir',
      description: 'Generate kartu identitas e-Hadir tanpa foto dan dengan QR jelas',
      icon: CreditCard,
      href: '/generate',
      color: 'bg-primary-600 hover:bg-primary-700',
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
                <div className="flex items-center justify-between p-3 bg-primary-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-primary-500" />
                    <span className="text-sm text-gray-700">Database</span>
                  </div>
                  <span className="text-xs font-medium text-primary-600">Aktif</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-blue-500" />
                    <span className="text-sm text-gray-700">Storage</span>
                  </div>
                  <span className="text-xs font-medium text-primary-600">Tersedia</span>
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
            <h2 className="text-xl font-semibold mb-2">Memulai Generator Kartu e-Hadir</h2>
            <p className="text-primary-100 mb-4">
              Ikuti langkah-langkah berikut untuk membuat kartu identitas absensi ukuran 5,5 × 8,5 cm:
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
                  <p className="text-sm text-primary-200">Download PDF A4 siap cetak dengan QR jelas</p>
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
