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
    <aside className="sticky top-0 z-30 w-full border-b border-white/10 bg-[#05070a] text-white shadow-[0_18px_70px_rgba(0,0,0,0.28)] lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:border-b-0 lg:border-r lg:shadow-[18px_0_70px_rgba(0,0,0,0.34)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(111,166,216,0.18),transparent_34%)]" />

      <div className="relative flex h-16 items-center px-4 sm:px-5 lg:h-20">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl border border-[#6fa6d8]/30 bg-[#6fa6d8]/12 shadow-[0_0_34px_rgba(111,166,216,0.22)] lg:h-12 lg:w-12">
            <GraduationCap className="h-6 w-6 text-[#b9dcf7] lg:h-7 lg:w-7" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-black tracking-[0.2em] text-white">SIAB2</h1>
            <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Generator Kartu
            </p>
          </div>
        </div>
      </div>

      <nav className="relative flex gap-2 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1 lg:overflow-visible lg:py-4">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              `flex flex-shrink-0 items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-bold transition-all duration-200 lg:gap-3 lg:py-3 ${
                isActive
                  ? 'bg-[#6fa6d8] text-[#061017] shadow-[0_16px_34px_rgba(111,166,216,0.22)]'
                  : 'text-slate-400 hover:bg-white/8 hover:text-white'
              }`
            }
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            <span className="whitespace-nowrap">{item.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="absolute bottom-0 left-0 right-0 hidden p-4 lg:block">
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
