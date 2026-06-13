import { useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { AlertTriangle, Check, Cpu, Loader2, Moon, RefreshCw, Sun, X } from 'lucide-react';
import { initials } from './api';
import type { ApiState, Column, PaginationMeta, ThemeMode, ToastMessage } from './types';

export function ToastHost({ toast, onClose }: { toast: ToastMessage | null; onClose: () => void }) {
  if (!toast) return null;
  return (
    <div className={`toast ${toast.type || ''}`} role="status">
      <div className="row" style={{ gap: 8 }}>
        {toast.type === 'bad' ? <AlertTriangle size={16} /> : <Check size={16} />}
        <span>{toast.message}</span>
        <button className="btn icon ghost" onClick={onClose} aria-label="Tutup notifikasi"><X size={14} /></button>
      </div>
    </div>
  );
}

export function Pill({ tone = '', children, dot = true }: { tone?: string; children: ReactNode; dot?: boolean }) {
  return <span className={`pill ${tone}`}>{dot && <span className="d" />}{children}</span>;
}

export function statusLabel(status?: string | null): string {
  return ({
    HADIR: 'Hadir',
    TELAT: 'Terlambat',
    IZIN: 'Izin',
    SAKIT: 'Sakit',
    ALPA: 'Alpa',
    OPEN: 'Berjalan',
    CLOSED: 'Selesai',
    SCHEDULED: 'Terjadwal',
    MISSED: 'Terlewat',
    ACTIVE: 'Aktif',
    LOST: 'Hilang',
    INACTIVE: 'Nonaktif',
    REVOKED: 'Dicabut',
    QR_ANDROID: 'HP Android',
    GATE_IN: 'Gerbang Masuk',
    GATE_OUT: 'Gerbang Keluar',
    RESOLVED: 'Selesai',
    QUEUED: 'Menunggu',
    IN: 'Masuk',
    OUT: 'Keluar',
    INFO: 'Informasi',
    WARN: 'Perhatian',
    URGENT: 'Penting',
    PENDING: 'Menunggu',
    APPROVED: 'Disetujui',
    REJECTED: 'Ditolak',
    CANCELLED: 'Dibatalkan',
    DINAS_LUAR: 'Dinas luar',
    EXCUSED_ABSENCE: 'Izin/dinas',
    ALPA_MENGAJAR: 'Alpa mengajar',
    IN_REVIEW: 'Sedang ditinjau',
    ESCALATED: 'Dieskalasikan',
    LOW: 'Rendah',
    NORMAL: 'Normal',
    HIGH: 'Tinggi',
    BOLOS_KELAS: 'Diduga bolos kelas',
    LUPA_TAP_GERBANG: 'Lupa tap gerbang',
    TIDAK_MENGAJAR: 'Guru belum mengajar',
    ANOMALI_BUKA_TANPA_GERBANG: 'Buka sesi tanpa data gerbang',
    BELUM_SCAN_GERBANG: 'Belum scan gerbang',
    BELUM_SCAN_DHUHA: 'Belum scan Dhuha',
    BELUM_SCAN_DZUHUR: 'Belum scan Dzuhur',
    BELUM_SCAN_ASHAR: 'Belum scan Ashar',
    BELUM_SCAN_KELUAR_GERBANG: 'Belum scan keluar gerbang',
    GATE_TAP: 'Scan Gerbang',
    ANOMALY: 'Masalah',
    SESSION_OPENED: 'Sesi Dibuka',
    SESSION_CLOSED: 'Sesi Ditutup',
    CLASS_ATTENDANCE: 'Presensi Kelas',
    TEACHER_CHECKIN: 'Guru Absen Masuk',
    TEACHER_CHECKOUT: 'Guru Absen Keluar',
    GATE: 'Gerbang',
    MUSHOLA: 'Mushola',
    CLASS: 'Verifikasi kelas',
    MANUAL: 'Manual',
    DHUHA: 'Dhuha',
    DZUHUR: 'Dzuhur',
    ASHAR: 'Ashar',
    ADMIN_TU: 'Admin/TU',
    OPERATOR_IT: 'Operator IT',
    GURU_MAPEL: 'Guru Mapel',
    GURU_PIKET: 'Guru Piket',
    SISWA: 'Siswa',
    DEVELOPER: 'Developer'
  } as Record<string, string>)[String(status)] || status || '—';
}

export function StatusPill({ status }: { status?: string | null }) {
  const tone = ({
    HADIR: 'ok', TELAT: 'warn', IZIN: 'info', SAKIT: 'acc', ALPA: 'bad', EXCUSED_ABSENCE: 'info', ALPA_MENGAJAR: 'bad',
    OPEN: 'ok', CLOSED: '', SCHEDULED: '', MISSED: 'bad', ACTIVE: 'ok', LOST: 'bad', INACTIVE: '', REVOKED: 'bad', RESOLVED: 'ok', QUEUED: 'warn', IN: 'ok', OUT: 'info', WARN: 'warn', URGENT: 'bad', PENDING: 'warn', APPROVED: 'ok', REJECTED: 'bad', CANCELLED: '', DINAS_LUAR: 'info', IN_REVIEW: 'info', ESCALATED: 'warn', HIGH: 'warn', LOW: 'info', GATE_TAP: 'ok', ANOMALY: 'warn', SESSION_OPENED: 'ok', SESSION_CLOSED: 'info', CLASS_ATTENDANCE: 'info', TEACHER_CHECKIN: 'ok', TEACHER_CHECKOUT: 'info', GATE: 'ok', QR_ANDROID: 'ok', GATE_IN: 'ok', GATE_OUT: 'info', MUSHOLA: 'info', CLASS: 'warn', MANUAL: 'info', DHUHA: 'ok', DZUHUR: 'ok', ASHAR: 'ok', BELUM_SCAN_GERBANG: 'warn', BELUM_SCAN_DHUHA: 'warn', BELUM_SCAN_DZUHUR: 'warn', BELUM_SCAN_ASHAR: 'warn', BELUM_SCAN_KELUAR_GERBANG: 'warn', DEVELOPER: 'acc'
  } as Record<string, string>)[String(status)] || '';
  return <Pill tone={tone}>{statusLabel(status)}</Pill>;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampPercent(value: unknown): number {
  return Math.max(0, Math.min(100, toFiniteNumber(value)));
}

function pickValue(row: Record<string, any>, keys: string[], fallback = 0): number {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null) return toFiniteNumber(row[key], fallback);
  }
  return fallback;
}

function pickLabel(row: Record<string, any>, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return fallback;
}

export function ProgressRing({ value, label, sub }: { value: number; label: ReactNode; sub?: ReactNode }) {
  const pct = clampPercent(value);
  return <div className="chart-ring-wrap"><div className="chart-ring" style={{ '--value': pct } as any}><span>{Math.round(pct)}%</span></div><div><div className="chart-title">{label}</div>{sub && <div className="chart-sub">{sub}</div>}</div></div>;
}

export function StackedBar({ segments, total }: { segments: Array<{ label: ReactNode; value: number; tone?: string }>; total?: number }) {
  const safeSegments = segments.map((segment) => ({ ...segment, value: Math.max(0, toFiniteNumber(segment.value)) })).filter((segment) => segment.value > 0);
  const sum = Math.max(1, total ?? safeSegments.reduce((acc, segment) => acc + segment.value, 0));
  if (!safeSegments.length) return <div className="chart-empty small">Belum ada data.</div>;
  return <div className="stacked-chart"><div className="stacked-track">{safeSegments.map((segment, index) => <span key={index} className={`stacked-seg ${segment.tone || ''}`} style={{ width: `${Math.max(3, (segment.value / sum) * 100)}%` }} title={`${segment.label}: ${segment.value}`} />)}</div><div className="stacked-legend">{safeSegments.map((segment, index) => <span key={index}><i className={segment.tone || ''} />{segment.label}<b>{segment.value}</b></span>)}</div></div>;
}

export function TrendChart({ data, valueKeys = ['coveragePercent', 'value', 'percent'], labelKeys = ['label', 'dateLabel', 'date'] }: { data: unknown; valueKeys?: string[]; labelKeys?: string[] }) {
  const rows = (Array.isArray(data) ? data : (data as any)?.items || []).slice(0, 7) as Record<string, any>[];
  if (!rows.length) return <div className="chart-empty">Belum ada data tren untuk ditampilkan.</div>;
  return <div className="trend-chart" aria-label="Grafik tren">{rows.map((row, index) => {
    const value = clampPercent(pickValue(row, valueKeys));
    const label = pickLabel(row, labelKeys, `H-${rows.length - index - 1}`);
    return <div className="trend-col" key={row.id || row.date || row.label || index} title={`${label}: ${Math.round(value)}%`}><div className="trend-value">{Math.round(value)}%</div><div className="trend-track"><div className="trend-bar" style={{ height: `${Math.max(4, value)}%` }} /></div><div className="trend-label">{label}</div></div>;
  })}</div>;
}

export function StatusDonut({ counts, title = 'Komposisi status' }: { counts: Record<string, number>; title?: ReactNode }) {
  const entries = Object.entries(counts || {}).map(([key, value]) => ({ key, value: Math.max(0, toFiniteNumber(value)) })).filter((entry) => entry.value > 0);
  const total = entries.reduce((acc, entry) => acc + entry.value, 0);
  if (!total) return <div className="chart-empty small">Belum ada status yang tercatat.</div>;
  let cursor = 0;
  const gradient = entries.map((entry, index) => {
    const start = cursor;
    const end = cursor + (entry.value / total) * 100;
    cursor = end;
    return `var(--chart-${String(entry.key).toLowerCase()}, var(--accent)) ${start}% ${end}%`;
  }).join(', ');
  return <div className="donut-panel"><div className="donut" style={{ background: `conic-gradient(${gradient})` }}><span>{total}</span></div><div><div className="chart-title">{title}</div><div className="donut-legend">{entries.map((entry) => <span key={entry.key}><i style={{ background: `var(--chart-${entry.key.toLowerCase()}, var(--accent))` }} />{statusLabel(entry.key)}<b>{entry.value}</b></span>)}</div></div></div>;
}

export function HorizontalBarList({ data, labelKeys = ['label', 'name', 'fullName', 'classCode', 'subjectName'], valueKeys = ['coveragePercent', 'percent', 'value', 'total', 'count', 'hadir', 'sessions'] }: { data: unknown; labelKeys?: string[]; valueKeys?: string[] }) {
  const rows = (Array.isArray(data) ? data : (data as any)?.items || []).map((row: Record<string, any>, index: number) => ({ label: pickLabel(row, labelKeys, `Data ${index + 1}`), value: pickValue(row, valueKeys, NaN) })).filter((row: { value: number }) => Number.isFinite(row.value)).slice(0, 8);
  if (!rows.length) return <div className="chart-empty small">Belum ada angka yang bisa dibuat grafik.</div>;
  const max = Math.max(1, ...rows.map((row: { value: number }) => row.value));
  return <div className="hbar-list">{rows.map((row: { label: string; value: number }, index: number) => <div className="hbar-row" key={`${row.label}-${index}`}><div className="hbar-label">{row.label}</div><div className="hbar-track"><span style={{ width: `${Math.max(3, (row.value / max) * 100)}%` }} /></div><div className="hbar-value">{Math.round(row.value)}</div></div>)}</div>;
}

export function Avatar({ name = 'User', size = '' }: { name?: string; size?: string }) {
  const hue = [...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return <div className={`ava ${size}`} style={{ background: `oklch(0.35 0.08 ${hue})`, color: `oklch(0.88 0.07 ${hue})` }}>{initials(name)}</div>;
}

export interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: string;
  size?: string;
  loading?: boolean;
}

export function Btn({ variant = '', size = '', children, loading = false, ...props }: BtnProps) {
  return <button className={`btn ${variant} ${size}`} disabled={loading || props.disabled} {...props}>{loading ? <Loader2 className="spin" size={14} /> : null}{children}</button>;
}

export function IconBtn({ label, children, ...props }: BtnProps & { label: string }) {
  return <button className="btn icon ghost" aria-label={label} title={label} {...props}>{children}</button>;
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return <div className="field"><div className="field-label"><span>{label}</span>{hint && <span className="mono faint" style={{ fontSize: 11 }}>{hint}</span>}</div>{children}</div>;
}

export function TextInput({ icon, ...props }: any) {
  return <label className="input">{icon}{props.type === 'textarea' ? <textarea {...props} /> : <input {...props} />}</label>;
}

interface SelectInputProps extends SelectHTMLAttributes<HTMLSelectElement> {
  wrapperClassName?: string;
}

export function SelectInput({ wrapperClassName = '', className = '', ...props }: SelectInputProps) {
  return <label className={`input select-input ${wrapperClassName}`.trim()}><select className={className} {...props} /></label>;
}

export function Card({ title, sub, actions, children, pad = true }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode; pad?: boolean }) {
  return <div className={`card ${pad ? 'pad' : ''}`}>{title && <div className="card-head compact"><div><div className="card-title">{title}</div>{sub && <div className="card-sub">{sub}</div>}</div>{actions && <div className="row table-actions">{actions}</div>}</div>}{children}</div>;
}

export function PageHead({ eyebrow, title, sub, actions }: { eyebrow: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return <div className="page-head"><div><div className="eyebrow"><span className="dot" /> {eyebrow}</div><h1 className="page-title">{title}</h1>{sub && <div className="page-sub">{sub}</div>}</div>{actions && <div className="row page-actions">{actions}</div>}</div>;
}

export function LoadingState({ label = 'Memuat data…' }: { label?: string }) {
  return <div className="card pad-lg state"><Loader2 className="spin" /> <span>{label}</span></div>;
}

export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return <div className="card pad-lg state bad"><AlertTriangle /> <span>{error}</span>{onRetry && <Btn onClick={onRetry}><RefreshCw size={14} /> Coba lagi</Btn>}</div>;
}

export function EmptyState({ title = 'Belum ada data', sub = 'Data akan muncul di sini setelah tersedia.' }: { title?: string; sub?: string }) {
  return <div className="empty"><Cpu size={26} /><b>{title}</b><span>{sub}</span></div>;
}

export function FriendlyEmptyState({ title = 'Belum ada data', sub = 'Nanti kalau sudah ada aktivitas, data akan muncul di sini.', action }: { title?: string; sub?: string; action?: ReactNode }) {
  return <div className="friendly-empty"><Cpu size={28} /><b>{title}</b><span>{sub}</span>{action && <div className="friendly-empty-action">{action}</div>}</div>;
}

export function SimpleHelpBox({ title = 'Bantuan singkat', items, children }: { title?: ReactNode; items?: ReactNode[]; children?: ReactNode }) {
  return <div className="simple-help"><b>{title}</b>{items?.length ? <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : children}</div>;
}

export function StepGuide({ title = 'Ikuti langkah ini', steps }: { title?: ReactNode; steps: ReactNode[] }) {
  return <div className="step-guide" aria-label={String(title)}><div className="step-guide-title">{title}</div><div className="step-guide-list">{steps.map((step, index) => <div className="step-guide-item" key={index}><b>{index + 1}</b><span>{step}</span></div>)}</div></div>;
}

export function QuickActionCard({ title, desc, icon, actionLabel, onClick, tone = '' }: { title: ReactNode; desc?: ReactNode; icon?: ReactNode; actionLabel?: ReactNode; onClick?: () => void; tone?: string }) {
  return <button type="button" className={`quick-action-card ${tone}`} onClick={onClick}><span className="quick-action-icon">{icon || <Check size={18} />}</span><b>{title}</b>{desc && <small>{desc}</small>}{actionLabel && <em>{actionLabel}</em>}</button>;
}

export function RoleTaskPanel({ title = 'Apa yang harus saya lakukan sekarang?', tasks }: { title?: ReactNode; tasks: Array<{ title: ReactNode; desc?: ReactNode; icon?: ReactNode; actionLabel?: ReactNode; onClick?: () => void; tone?: string }> }) {
  return <Card title={title} sub="Tombol cepat untuk pekerjaan harian paling penting."><div className="role-task-grid">{tasks.map((task, index) => <QuickActionCard key={index} title={task.title} desc={task.desc} icon={task.icon} actionLabel={task.actionLabel || 'Buka'} onClick={task.onClick} tone={task.tone} />)}</div></Card>;
}

export function DataTable<T extends Record<string, any>>({ rows, columns, empty = 'Tidak ada data', onRow }: { rows: T[]; columns: Column<T>[]; empty?: string; onRow?: (row: T) => ReactNode }) {
  if (!rows?.length) return <EmptyState title={empty} />;
  const labelFor = (column: Column<T>) => typeof column.header === 'string' ? column.header : String(column.key || '');
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => <th key={String(c.key || c.header)} scope="col">{c.header}</th>)}
            {onRow && <th scope="col" className="cell-actions">Aksi</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || row.uid || i}>
              {columns.map((c) => (
                <td key={String(c.key || c.header)} data-label={labelFor(c)}>
                  <span className="cell-wrap">{c.render ? c.render(row, i) : String(row[c.key as string] ?? '—')}</span>
                </td>
              ))}
              {onRow && <td className="cell-actions" data-label="Aksi"><span className="table-actions">{onRow(row)}</span></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ meta, onPage }: { meta: PaginationMeta; onPage: (page: number) => void }) {
  if (!meta || (meta.totalPages || 1) <= 1) return null;
  return <div className="row pagination"><Btn size="sm" disabled={(meta.page || 1) <= 1} onClick={() => onPage((meta.page || 1) - 1)}>Sebelumnya</Btn><span className="mono muted">Hal {meta.page} / {meta.totalPages} · {meta.total} data</span><Btn size="sm" disabled={(meta.page || 1) >= (meta.totalPages || 1)} onClick={() => onPage((meta.page || 1) + 1)}>Berikutnya</Btn></div>;
}

const THEME_DEFS: ReadonlyArray<{
  key: ThemeMode; label: string; sub: string; bg: string; accent: string;
}> = [
  { key: 'dark',     label: 'Gelap Biru',    sub: 'Navy dalam',     bg: '#0F1C2E', accent: '#4B9EDF' },
  { key: 'light',    label: 'Terang Bersih', sub: 'Abu netral',     bg: '#F5F7FA', accent: '#2563B8' },
  { key: 'midnight', label: 'Tengah Malam',  sub: 'Hitam OLED',     bg: '#111111', accent: '#4DCFE8' },
  { key: 'ocean',    label: 'Samudra',       sub: 'Teal atmosferik', bg: '#071C2A', accent: '#2ECFC0' },
  { key: 'warm',     label: 'Hangat Pasir',  sub: 'Krem nyaman',    bg: '#F8F3EC', accent: '#2563B8' },
];

export function ThemeToggle({ mode, onToggle }: { mode: ThemeMode; onToggle: (theme: ThemeMode) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [open]);

  const isDark = mode === 'dark' || mode === 'midnight' || mode === 'ocean';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <IconBtn label={`Tema aktif: ${THEME_DEFS.find(t => t.key === mode)?.label ?? mode}. Klik untuk ganti.`} onClick={() => setOpen(v => !v)}>
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </IconBtn>
      {open && (
        <div className="theme-picker" role="menu" aria-label="Pilih tema tampilan">
          <div className="theme-picker-title">Tema Tampilan</div>
          {THEME_DEFS.map(t => (
            <button
              key={t.key}
              role="menuitemradio"
              aria-checked={mode === t.key}
              className={`theme-option${mode === t.key ? ' active' : ''}`}
              onClick={() => { onToggle(t.key); setOpen(false); }}
            >
              <span
                className="theme-swatch"
                aria-hidden="true"
                style={{ background: `linear-gradient(140deg, ${t.bg} 54%, ${t.accent} 54%)` }}
              />
              <span className="theme-option-text">
                <span className="theme-option-name">{t.label}</span>
                <span className="theme-option-sub">{t.sub}</span>
              </span>
              {mode === t.key && <Check size={13} aria-hidden="true" style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--accent)' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AsyncTable<T extends Record<string, any>>({ state, columns, empty, onRow }: { state: ApiState<any>; columns: Column<T>[]; empty?: string; onRow?: (row: T) => ReactNode }) {
  if (state.loading) return <LoadingState />;
  if (state.error) return <ErrorState error={state.error} onRetry={state.refresh} />;
  const rows = Array.isArray(state.data) ? state.data : state.data?.items || state.data?.roster || [];
  return <DataTable rows={rows} columns={columns} empty={empty} onRow={onRow} />;
}
