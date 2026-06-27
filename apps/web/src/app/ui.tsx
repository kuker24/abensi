import { createContext, useContext } from 'react';
import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { AlertTriangle, Check, Cpu, Loader2, RefreshCw, X } from 'lucide-react';
import { initials } from './api';
import type { ApiState, Column, PaginationMeta, ToastMessage } from './types';

export function ToastHost({ toasts, onClose }: { toasts: ToastMessage[]; onClose: (id: number) => void }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 600, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420 }}>
      {toasts.map((t) => {
        const icon = t.type === 'bad' ? <AlertTriangle size={16} aria-hidden="true" /> : t.type === 'warn' ? <AlertTriangle size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />;
        return (
          <div key={t.id} className={`toast ${t.type || ''}`} role="status" aria-live="polite" style={{ position: 'static', minWidth: 280, maxWidth: 480, right: 'auto', top: 'auto' }}>
            <div className="row" style={{ gap: 10 }}>
              {icon}
              <span style={{ flex: 1, lineHeight: 1.4 }}>{t.message}</span>
              <button className="btn icon ghost" style={{ width: 32, height: 32, minWidth: 32, minHeight: 32 }} onClick={() => onClose(t.id!)} aria-label="Tutup notifikasi"><X size={14} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Pill({ tone = '', children, dot = true }: { tone?: string; children: ReactNode; dot?: boolean }) {
  return <span className={`pill siab2-status-pill ${tone}`}>{dot && <span className="d" />}{children}</span>;
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
    HADIR_LENGKAP: 'Hadir lengkap',
    BELUM_SCAN_DATANG: 'Belum scan datang',
    BELUM_SCAN_PULANG: 'Belum scan pulang',
    BELUM_ABSEN_KELAS: 'Belum diabsen guru',
    BELUM_SCAN_SHOLAT: 'Belum scan sholat',
    PERLU_VERIFIKASI: 'Perlu verifikasi',
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
    KEPALA_SEKOLAH: 'Kepala Sekolah',
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
    OPEN: 'ok', CLOSED: '', SCHEDULED: '', MISSED: 'bad', ACTIVE: 'ok', LOST: 'bad', INACTIVE: '', REVOKED: 'bad', RESOLVED: 'ok', QUEUED: 'warn', IN: 'ok', OUT: 'info', WARN: 'warn', URGENT: 'bad', PENDING: 'warn', APPROVED: 'ok', REJECTED: 'bad', CANCELLED: '', DINAS_LUAR: 'info', IN_REVIEW: 'info', ESCALATED: 'warn', HIGH: 'warn', LOW: 'info', GATE_TAP: 'ok', ANOMALY: 'warn', SESSION_OPENED: 'ok', SESSION_CLOSED: 'info', CLASS_ATTENDANCE: 'info', TEACHER_CHECKIN: 'ok', TEACHER_CHECKOUT: 'info', GATE: 'ok', QR_ANDROID: 'ok', GATE_IN: 'ok', GATE_OUT: 'info', MUSHOLA: 'info', CLASS: 'warn', MANUAL: 'info', DHUHA: 'ok', DZUHUR: 'ok', ASHAR: 'ok', HADIR_LENGKAP: 'ok', BELUM_SCAN_DATANG: 'warn', BELUM_SCAN_PULANG: 'warn', BELUM_ABSEN_KELAS: 'warn', BELUM_SCAN_SHOLAT: 'warn', PERLU_VERIFIKASI: 'bad', BELUM_SCAN_GERBANG: 'warn', BELUM_SCAN_DHUHA: 'warn', BELUM_SCAN_DZUHUR: 'warn', BELUM_SCAN_ASHAR: 'warn', BELUM_SCAN_KELUAR_GERBANG: 'warn', KEPALA_SEKOLAH: 'acc', DEVELOPER: 'acc'
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
  return <button className={`btn siab2-action-button ${variant} ${size}`} disabled={loading || props.disabled} {...props}>{loading ? <Loader2 className="spin" size={14} /> : null}{children}</button>;
}

export function IconBtn({ label, children, ...props }: BtnProps & { label: string }) {
  return <button className="btn siab2-action-button icon ghost" aria-label={label} title={label} {...props}>{children}</button>;
}

const FieldLabelContext = createContext<string | undefined>(undefined);

function textFromNode(value: ReactNode): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textFromNode).filter(Boolean).join(' ') || undefined;
  return undefined;
}

function namedControlProps(props: Record<string, unknown>, fallbackLabel?: string) {
  if (props['aria-label'] || props['aria-labelledby'] || !fallbackLabel) return props;
  return { ...props, 'aria-label': fallbackLabel };
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return <div className="field siab2-form-field"><div className="field-label siab2-form-label"><span>{label}</span>{hint && <span className="mono faint" style={{ fontSize: 11 }}>{hint}</span>}</div><FieldLabelContext.Provider value={textFromNode(label)}>{children}</FieldLabelContext.Provider></div>;
}

export function TextInput({ icon, type, ...props }: any) {
  const fieldLabel = useContext(FieldLabelContext);
  const controlProps = namedControlProps(props, fieldLabel);
  return <label className="input siab2-input">{icon}{type === 'textarea' ? <textarea {...controlProps} /> : <input type={type} {...controlProps} />}</label>;
}

interface SelectInputProps extends SelectHTMLAttributes<HTMLSelectElement> {
  wrapperClassName?: string;
}

export function SelectInput({ wrapperClassName = '', className = '', ...props }: SelectInputProps) {
  const fieldLabel = useContext(FieldLabelContext);
  const controlProps = namedControlProps(props as Record<string, unknown>, fieldLabel) as SelectHTMLAttributes<HTMLSelectElement>;
  return <label className={`input select-input siab2-select-input ${wrapperClassName}`.trim()}><select className={className} {...controlProps} /></label>;
}

export function Card({ title, sub, actions, children, pad = true, variant = 'default' }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode; pad?: boolean; variant?: 'default' | 'elevated' | 'glass' | 'flat' }) {
  const variantClass = variant === 'elevated' ? 'card-elevated' : variant === 'glass' ? 'card-glass' : variant === 'flat' ? 'card-flat' : '';
  return <div className={`card siab2-content-card ${variantClass} ${pad ? 'pad' : ''}`}>{title && <div className="card-head compact siab2-content-card-head"><div><div className="card-title siab2-content-card-title">{title}</div>{sub && <div className="card-sub siab2-content-card-sub">{sub}</div>}</div>{actions && <div className="row table-actions siab2-action-bar">{actions}</div>}</div>}{children}</div>;
}

export function PageHead({ eyebrow, title, sub, actions }: { eyebrow: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return <div className="page-head siab2-page-head"><div><div className="eyebrow siab2-page-eyebrow"><span className="dot" /> {eyebrow}</div><h1 className="page-title siab2-page-title">{title}</h1>{sub && <div className="page-sub siab2-page-sub">{sub}</div>}</div>{actions && <div className="row page-actions siab2-page-actions">{actions}</div>}</div>;
}

function friendlyErrorDetails(error: string) {
  const raw = String(error || '').trim();
  const lower = raw.toLowerCase();
  if (lower.includes('forbidden') || lower.includes('403')) {
    return {
      title: 'Akses data ditolak',
      hint: 'Akun ini belum memiliki izin untuk membuka data tersebut. Jika seharusnya bisa, hubungi Admin/TU atau Operator IT.',
      detail: raw
    };
  }
  if (lower.includes('unauthorized') || lower.includes('401') || lower.includes('session')) {
    return {
      title: 'Sesi perlu diperiksa',
      hint: 'Silakan masuk ulang agar sistem bisa memastikan akses Anda masih aktif.',
      detail: raw
    };
  }
  if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('timeout')) {
    return {
      title: 'Koneksi belum stabil',
      hint: 'Periksa jaringan lalu coba muat ulang data.',
      detail: raw
    };
  }
  return {
    title: 'Data belum bisa dimuat',
    hint: 'Coba lagi beberapa saat. Jika masih terjadi, catat halaman ini dan hubungi Operator IT.',
    detail: raw
  };
}

export function LoadingState({ label = 'Memuat data…', sub = 'Mohon tunggu, sistem sedang mengambil data terbaru.' }: { label?: string; sub?: string }) {
  return <div className="card pad-lg state app-state loading-state siab2-loading-state" role="status" aria-live="polite" aria-busy="true"><span className="app-state-icon"><Loader2 className="spin" size={22} /></span><b>{label}</b><span>{sub}</span></div>;
}

export function ErrorState({ error, onRetry, title, hint }: { error: string; onRetry?: () => void; title?: string; hint?: string }) {
  const details = friendlyErrorDetails(error);
  const showDetail = details.detail && details.detail !== details.title && details.detail !== title;
  return <div className="card pad-lg state app-state bad siab2-error-state" role="alert"><span className="app-state-icon"><AlertTriangle size={22} /></span><b>{title || details.title}</b><span>{hint || details.hint}</span>{showDetail && <small className="state-detail">Detail: {details.detail}</small>}{onRetry && <Btn onClick={onRetry}><RefreshCw size={14} /> Coba lagi</Btn>}</div>;
}

export function EmptyState({ title = 'Belum ada data', sub = 'Data akan muncul di sini setelah tersedia.', action }: { title?: string; sub?: string; action?: ReactNode }) {
  return <div className="empty app-state siab2-empty-state"><span className="app-state-icon"><Cpu size={26} /></span><b>{title}</b><span>{sub}</span>{action && <div className="app-state-action">{action}</div>}</div>;
}

export function FriendlyEmptyState({ title = 'Belum ada data', sub = 'Nanti kalau sudah ada aktivitas, data akan muncul di sini.', action }: { title?: string; sub?: string; action?: ReactNode }) {
  return <div className="friendly-empty app-state siab2-empty-state"><span className="app-state-icon"><Cpu size={28} /></span><b>{title}</b><span>{sub}</span>{action && <div className="friendly-empty-action app-state-action">{action}</div>}</div>;
}

export function SimpleHelpBox({ title = 'Bantuan singkat', items, children }: { title?: ReactNode; items?: ReactNode[]; children?: ReactNode }) {
  return <div className="simple-help siab2-help-box"><b>{title}</b>{items?.length ? <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : children}</div>;
}

export function StepGuide({ title = 'Ikuti langkah ini', steps }: { title?: ReactNode; steps: ReactNode[] }) {
  return <div className="step-guide siab2-step-guide" aria-label={String(title)}><div className="step-guide-title">{title}</div><div className="step-guide-list">{steps.map((step, index) => <div className="step-guide-item" key={index}><b>{index + 1}</b><span>{step}</span></div>)}</div></div>;
}

export function QuickActionCard({ title, desc, icon, actionLabel, onClick, tone = '' }: { title: ReactNode; desc?: ReactNode; icon?: ReactNode; actionLabel?: ReactNode; onClick?: () => void; tone?: string }) {
  return <button type="button" className={`quick-action-card siab2-quick-action-card ${tone}`} onClick={onClick}><span className="quick-action-icon">{icon || <Check size={18} />}</span><b>{title}</b>{desc && <small>{desc}</small>}{actionLabel && <em>{actionLabel}</em>}</button>;
}

export function RoleTaskPanel({ title = 'Apa yang harus saya lakukan sekarang?', tasks }: { title?: ReactNode; tasks: Array<{ title: ReactNode; desc?: ReactNode; icon?: ReactNode; actionLabel?: ReactNode; onClick?: () => void; tone?: string }> }) {
  return <Card title={title} sub="Tombol cepat untuk pekerjaan harian paling penting."><div className="role-task-grid">{tasks.map((task, index) => <QuickActionCard key={index} title={task.title} desc={task.desc} icon={task.icon} actionLabel={task.actionLabel || 'Buka'} onClick={task.onClick} tone={task.tone} />)}</div></Card>;
}

type EmptyStateConfig = string | { title?: string; sub?: string; action?: ReactNode };

export function DataTable<T extends Record<string, any>>({ rows, columns, empty = 'Tidak ada data', onRow }: { rows: T[]; columns: Column<T>[]; empty?: EmptyStateConfig; onRow?: (row: T) => ReactNode }) {
  if (!rows?.length) {
    const emptyConfig = typeof empty === 'string' ? { title: empty } : empty;
    return <EmptyState title={emptyConfig.title || 'Tidak ada data'} sub={emptyConfig.sub || 'Data akan muncul di sini setelah tersedia.'} action={emptyConfig.action} />;
  }
  const labelFor = (column: Column<T>) => typeof column.header === 'string' ? column.header : String(column.key || '');
  return (
    <div className="table-wrap siab2-data-table-wrap" tabIndex={0} role="region" aria-label="Tabel data">
      <table className="data-table siab2-data-table">
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
              {onRow && <td className="cell-actions" data-label="Aksi"><span className="table-actions siab2-table-actions">{onRow(row)}</span></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ meta, onPage }: { meta: PaginationMeta; onPage: (page: number) => void }) {
  if (!meta || (meta.totalPages || 1) <= 1) return null;
  return <div className="row pagination siab2-pagination"><Btn size="sm" disabled={(meta.page || 1) <= 1} onClick={() => onPage((meta.page || 1) - 1)}>Sebelumnya</Btn><span className="mono muted">Hal {meta.page} / {meta.totalPages} · {meta.total} data</span><Btn size="sm" disabled={(meta.page || 1) >= (meta.totalPages || 1)} onClick={() => onPage((meta.page || 1) + 1)}>Berikutnya</Btn></div>;
}

export function StatCardPremium({ icon, label, value, sub, tone = '', onClick }: { icon?: ReactNode; label: string; value: ReactNode; sub?: ReactNode; tone?: string; onClick?: () => void }) {
  return (
    <div className={`stat-premium siab2-stat-card ${tone} ${onClick ? 'hover' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick(); } } : undefined} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className={`stat-icon ${tone}`}>{icon || <Check size={18} />}</div>
      <div className="stat-main">
        <div className="stat-label">{label}</div>
        <div className="stat-num">{value}</div>
        {sub && <div className={`stat-delta ${tone}`}>{sub}</div>}
      </div>
    </div>
  );
}

export function RosterProgress({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="roster-progress" aria-label={`Presensi ${pct}% selesai`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SkeletonTable({ rows = 4 }: { rows?: number }) {
  return <div className="card siab2-content-card"><div className="table-wrap siab2-data-table-wrap" tabIndex={0} role="region" aria-label="Tabel sedang dimuat"><table className="data-table siab2-data-table"><tbody>{Array.from({ length: rows }).map((_, i) => <tr key={i}><td colSpan={6} style={{ padding: 12 }}><div className="skeleton" style={{ height: 14 }} /></td></tr>)}</tbody></table></div></div>;
}

export function AsyncTable<T extends Record<string, any>>({ state, columns, empty, onRow }: { state: ApiState<any>; columns: Column<T>[]; empty?: EmptyStateConfig; onRow?: (row: T) => ReactNode }) {
  if (state.loading) return <SkeletonTable />;
  if (state.error) return <ErrorState error={state.error} onRetry={state.refresh} />;
  const rows = Array.isArray(state.data) ? state.data : state.data?.items || state.data?.roster || [];
  return <DataTable rows={rows} columns={columns} empty={empty} onRow={onRow} />;
}

export function MetricCluster({ items, columns = 4 }: { items: Array<{ icon?: ReactNode; label: string; value: ReactNode; sub?: ReactNode; tone?: string; onClick?: () => void }>; columns?: 2 | 3 | 4 }) {
  return <div className={`metric-cluster g-${columns}`}>{items.map((item, index) => <StatCardPremium key={`${item.label}-${index}`} {...item} />)}</div>;
}

export function HeroPanel({ eyebrow, title, sub, actions, children, tone = '' }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode; tone?: string }) {
  return (
    <section className={`hero-panel ${tone}`}>
      <div className="hero-panel-copy">
        {eyebrow && <div className="eyebrow"><span className="dot" />{eyebrow}</div>}
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
        {actions && <div className="dashboard-hero-actions">{actions}</div>}
      </div>
      {children && <div className="hero-panel-side">{children}</div>}
    </section>
  );
}

export function SectionShell({ title, sub, actions, children, className = '' }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`section-shell ${className}`}>
      <div className="section-shell-head">
        <div>
          <h3>{title}</h3>
          {sub && <p>{sub}</p>}
        </div>
        {actions && <div className="section-shell-actions">{actions}</div>}
      </div>
      <div className="section-shell-body">{children}</div>
    </section>
  );
}
