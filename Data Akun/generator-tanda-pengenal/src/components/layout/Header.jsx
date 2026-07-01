import { Bell, Search, ShieldCheck, User } from 'lucide-react';
import { useStore } from '../../store/useStore';

const Header = ({ title, subtitle }) => {
  const { getStats } = useStore();
  const stats = getStats();

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#05070a]/88 backdrop-blur-xl">
      <div className="flex h-20 items-center justify-between px-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#8fb9d8]">
            <ShieldCheck className="h-3.5 w-3.5" />
            SIAB2 Identity System
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white">{title}</h1>
          {subtitle && (
            <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Cari data kartu..."
              className="w-72 rounded-2xl border border-white/10 bg-white/[0.06] py-2.5 pl-10 pr-4 text-sm font-medium text-white outline-none placeholder:text-slate-500 focus:border-[#6fa6d8]/60 focus:ring-4 focus:ring-[#6fa6d8]/10"
            />
          </div>

          {stats.totalUsers > 0 && (
            <div className="hidden items-center gap-2 rounded-2xl border border-[#6fa6d8]/20 bg-[#6fa6d8]/10 px-3 py-2 lg:flex">
              <span className="text-xs font-black text-[#c7e4fb]">
                {stats.readyCards}/{stats.totalUsers} siap
              </span>
              {stats.invalidCards > 0 && (
                <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-xs font-black text-amber-100">
                  {stats.invalidCards} perlu cek
                </span>
              )}
            </div>
          )}

          <button className="relative rounded-2xl border border-white/10 p-2.5 text-slate-400 transition hover:bg-white/8 hover:text-white">
            <Bell className="h-5 w-5" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#6fa6d8]" />
          </button>

          <button className="flex items-center gap-2 rounded-2xl border border-white/10 p-2 text-slate-200 transition hover:bg-white/8">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#6fa6d8]/18 text-[#b9dcf7]">
              <User className="h-4 w-4" />
            </span>
            <span className="hidden text-sm font-bold md:block">Operator</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
