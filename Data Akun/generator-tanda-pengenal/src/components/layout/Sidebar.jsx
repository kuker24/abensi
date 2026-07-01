import { NavLink } from 'react-router-dom';
import {
  CreditCard,
  FileDown,
  GraduationCap,
  LayoutDashboard,
  ShieldCheck,
  Upload,
  Users,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Import Data', href: '/import', icon: Upload },
  { name: 'Data Siswa', href: '/users', icon: Users },
  { name: 'Generate Kartu', href: '/generate', icon: CreditCard },
  { name: 'Export PDF', href: '/export', icon: FileDown },
];

const Sidebar = () => {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 w-64 border-r border-white/10 bg-[#05070a] text-white shadow-[18px_0_70px_rgba(0,0,0,0.34)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(111,166,216,0.18),transparent_34%)]" />

      <div className="relative flex h-20 items-center px-5">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fa6d8]/30 bg-[#6fa6d8]/12 shadow-[0_0_34px_rgba(111,166,216,0.22)]">
            <GraduationCap className="h-7 w-7 text-[#b9dcf7]" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-[0.2em] text-white">SIAB2</h1>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Generator Kartu
            </p>
          </div>
        </div>
      </div>

      <nav className="relative flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold transition-all duration-200 ${
                isActive
                  ? 'bg-[#6fa6d8] text-[#061017] shadow-[0_16px_34px_rgba(111,166,216,0.22)]'
                  : 'text-slate-400 hover:bg-white/8 hover:text-white'
              }`
            }
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            {item.name}
          </NavLink>
        ))}
      </nav>

      <div className="absolute bottom-0 left-0 right-0 p-4">
        <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4">
          <div className="flex items-center gap-2 text-[#b9dcf7]">
            <ShieldCheck className="h-4 w-4" />
            <p className="text-xs font-black uppercase tracking-[0.16em]">Official ID</p>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            MAN 1 Rokan Hulu · Sistem Informasi Akademik Berkarakter
          </p>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
