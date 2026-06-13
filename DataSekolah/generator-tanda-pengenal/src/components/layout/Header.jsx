import { Bell, Search, User, Users } from 'lucide-react';
import { useStore } from '../../store/useStore';

const Header = ({ title, subtitle }) => {
  const { getStats } = useStore();
  const stats = getStats();

  return (
    <header className="sticky top-0 z-20 bg-[#1e2025]/88 backdrop-blur-md border-b border-white/10">
      <div className="flex items-center justify-between h-16 px-6">
        {/* Page Title */}
        <div>
          <h1 className="font-serif text-xl font-bold text-[#f0ede8] tracking-tight">{title}</h1>
          {subtitle && (
            <p className="text-sm text-[#a8a29e] mt-0.5">{subtitle}</p>
          )}
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
            <input
              type="text"
              placeholder="Cari pengguna..."
              className="w-64 pl-10 pr-4 py-2 text-sm border border-white/10 rounded-xl bg-[#16181c] text-[#f0ede8] placeholder:text-[#78716c] focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
            />
          </div>

          {/* Stats Badge */}
          {stats.totalUsers > 0 && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-primary-500/10 rounded-xl border border-primary-500/20">
              <Users className="w-3.5 h-3.5 text-primary-600" />
              <span className="text-xs font-semibold text-primary-700">
                {stats.totalUsers}
              </span>
              {stats.selectedCount > 0 && (
                <span className="text-xs font-medium text-primary-700 bg-primary-100 px-2 py-0.5 rounded-md">
                  {stats.selectedCount} dipilih
                </span>
              )}
            </div>
          )}

          {/* Notifications */}
          <button className="relative p-2.5 text-[#a8a29e] hover:text-primary-300 hover:bg-primary-500/10 rounded-xl transition-colors">
            <Bell className="w-5 h-5" strokeWidth={1.5} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white"></span>
          </button>

          {/* User Menu */}
          <button className="flex items-center gap-2.5 p-1.5 pr-3 text-[#f0ede8] hover:bg-white/5 rounded-xl transition-colors border border-transparent hover:border-white/10">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center">
              <User className="w-4 h-4 text-white" strokeWidth={2} />
            </div>
            <span className="hidden md:block text-sm font-semibold">Admin</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
