import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Upload,
  Users,
  CreditCard,
  FileDown,
  GraduationCap,
  Settings,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Import Data', href: '/import', icon: Upload },
  { name: 'Data Pengguna', href: '/users', icon: Users },
  { name: 'Buat Kartu', href: '/generate', icon: CreditCard },
  { name: 'Export PDF', href: '/export', icon: FileDown },
];

const Sidebar = () => {
  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-gradient-to-b from-ink-800 to-ink-900 z-30 flex flex-col border-r border-white/5">
      {/* Logo */}
      <div className="flex items-center h-16 px-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/20">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-serif text-sm font-bold text-white tracking-tight">Kartu SIAB2</h1>
            <p className="text-xs text-primary-200/70">MAN 1 Rokan Hulu</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-primary-500/15 text-primary-300 border border-primary-500/20'
                  : 'text-warm-300/70 hover:text-white hover:bg-white/5'
              }`
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" strokeWidth={1.5} />
            {item.name}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5">
          <Settings className="w-4 h-4 text-warm-400/60" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-warm-200/80 truncate">SIAB2 Generator</p>
            <p className="text-[10px] text-warm-400/40">v4.0</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
