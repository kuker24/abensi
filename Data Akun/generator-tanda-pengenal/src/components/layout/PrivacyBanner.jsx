import { useState } from 'react';
import { AlertTriangle, ShieldCheck, Trash2 } from 'lucide-react';
import { useStore } from '../../store/useStore';

const PrivacyBanner = () => {
  const clearLocalData = useStore((state) => state.clearLocalData);
  const [cleared, setCleared] = useState(false);

  const handleClear = () => {
    clearLocalData();
    setCleared(true);
  };

  return (
    <section className="mb-4 overflow-hidden rounded-[24px] border border-amber-300/70 bg-amber-50 text-amber-950 shadow-sm sm:rounded-[28px]">
      <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl bg-amber-200/70 text-amber-900">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-amber-900">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              Kontrol Privasi Operator
            </p>
            <p className="mt-1 text-sm font-semibold leading-6 text-amber-950">
              Data kartu diproses di browser perangkat ini. Jangan impor CSV berisi password, token, secret, cookie, atau data sensitif lain. Gunakan perangkat tepercaya dan tekan Hapus Data Lokal setelah selesai.
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-amber-800">
              Route generator saat ini bersifat operator-only secara SOP; endpoint API resmi tetap membutuhkan sesi SIAB2.
            </p>
            {cleared && (
              <p className="mt-2 text-sm font-black text-emerald-700" role="status">
                Data lokal generator sudah dihapus dari browser ini.
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleClear}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#071018] px-4 py-3 text-sm font-black text-white transition hover:bg-[#13283a] focus:outline-none focus:ring-4 focus:ring-amber-300/70"
        >
          <Trash2 className="h-4 w-4" />
          Hapus Data Lokal
        </button>
      </div>
    </section>
  );
};

export default PrivacyBanner;
