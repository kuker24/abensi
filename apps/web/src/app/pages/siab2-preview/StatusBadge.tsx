interface StatusBadgeProps {
  type: string;
  text?: string;
}

const statusClass: Record<string, string> = {
  Hadir: 'siab2p-status-badge siab2p-status-badge-emerald',
  Izin: 'siab2p-status-badge siab2p-status-badge-sky',
  Sakit: 'siab2p-status-badge siab2p-status-badge-amber',
  Alfa: 'siab2p-status-badge siab2p-status-badge-rose',
  Terlambat: 'siab2p-status-badge siab2p-status-badge-orange',
  Aktif: 'siab2p-status-badge siab2p-status-badge-emerald',
  Pending: 'siab2p-status-badge siab2p-status-badge-slate',
  Nonaktif: 'siab2p-status-badge siab2p-status-badge-neutral'
};

export default function StatusBadge({ type, text }: StatusBadgeProps) {
  return <span className={statusClass[type] ?? statusClass.Pending}>{text ?? type}</span>;
}
