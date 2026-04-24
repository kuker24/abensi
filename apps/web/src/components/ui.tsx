import { ChevronDown, ChevronLeft, ChevronRight, Moon, PanelRightClose, Sun } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { labelForStatus } from '../lib/uiLabels';

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

export function Button(props: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  className?: string;
  loading?: boolean;
  loadingText?: string;
}) {
  const variant = props.variant ?? 'primary';
  const size = props.size ?? 'md';
  const disabled = props.disabled || props.loading;

  return (
    <button
      type={props.type ?? 'button'}
      onClick={props.onClick}
      disabled={disabled}
      aria-busy={props.loading}
      className={cn('btn', `btn-${variant}`, `btn-${size}`, props.className)}
    >
      {props.loading ? (
        <>
          <span className="btn-loader" aria-hidden="true" />
          {props.loadingText ?? 'Sedang diproses...'}
        </>
      ) : (
        props.children
      )}
    </button>
  );
}

export function Card(props: {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'elevated' | 'outlined' | 'glass';
}) {
  return <article className={cn('card', `card-${props.variant ?? 'default'}`, props.className)}>{props.children}</article>;
}

export function Badge(props: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }) {
  return <span className={cn('badge', `badge-${props.tone ?? 'neutral'}`)}>{props.children}</span>;
}

const statusToneMap: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  HADIR: 'success',
  TELAT: 'warning',
  IZIN: 'info',
  SAKIT: 'info',
  ALPA: 'danger',
  OPEN: 'success',
  CLOSED: 'neutral',
  MISSED: 'danger',
  SCHEDULED: 'warning',
  RESOLVED: 'success',
  QUEUED: 'info',
  EXCUSED_ABSENCE: 'info',
  ALPA_MENGAJAR: 'danger',
  ACTIVE: 'success',
  INACTIVE: 'warning',
  LOST: 'danger',
  BOLOS_KELAS: 'danger',
  LUPA_TAP_GERBANG: 'warning',
  TIDAK_MENGAJAR: 'danger',
  ANOMALI_BUKA_TANPA_GERBANG: 'warning',
  GATE_TAP: 'info',
  SESSION_OPENED: 'success',
  SESSION_CLOSED: 'neutral',
  ANOMALY: 'danger',
  VALID: 'success',
  TAP_IN_VALID: 'success',
  TAP_OUT_VALID: 'info',
  FLAG_OPEN: 'danger',
  FLAG_RESOLVED: 'success'
};

export function StatusPill({ status }: { status: string }) {
  const normalized = status.trim().toUpperCase();
  return <Badge tone={statusToneMap[normalized] ?? 'neutral'}>{labelForStatus(status)}</Badge>;
}

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label className="field-label" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

export function Input(props: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  error?: string | boolean;
  required?: boolean;
}) {
  return (
    <input
      id={props.id}
      className={cn('input', props.error ? 'input-error' : '', props.className)}
      type={props.type ?? 'text'}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      placeholder={props.placeholder}
      disabled={props.disabled}
      required={props.required}
      aria-invalid={Boolean(props.error)}
    />
  );
}

export function Select(props: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  disabled?: boolean;
  className?: string;
  error?: string | boolean;
  required?: boolean;
}) {
  return (
    <select
      id={props.id}
      className={cn('input', props.error ? 'input-error' : '', props.className)}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      disabled={props.disabled}
      required={props.required}
      aria-invalid={Boolean(props.error)}
    >
      {props.options.map((option) => (
        <option value={option.value} key={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Textarea(props: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  error?: string | boolean;
  required?: boolean;
}) {
  return (
    <textarea
      id={props.id}
      className={cn('input', props.error ? 'input-error' : '', props.className)}
      rows={props.rows ?? 3}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      placeholder={props.placeholder}
      required={props.required}
      aria-invalid={Boolean(props.error)}
    />
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((item) => item[0]?.toUpperCase() ?? '')
    .join('');

  return <div className="avatar">{initials || 'U'}</div>;
}

export function StatCard(props: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  return (
    <Card className={cn('stat-card', props.tone ? `stat-${props.tone}` : '')}>
      <p>{props.label}</p>
      <strong>{props.value}</strong>
      {props.hint ? <small>{props.hint}</small> : null}
    </Card>
  );
}

export function EmptyState(props: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <h3>{props.title}</h3>
      <p>{props.description}</p>
      {props.action}
    </div>
  );
}

export function Modal(props: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
  transitionPreset?: 'gentle' | 'snappy';
  preventClose?: boolean;
}) {
  const duration = props.transitionPreset === 'snappy' ? 0.14 : 0.22;

  return (
    <AnimatePresence>
      {props.open ? (
        <motion.div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (props.preventClose) return;
            props.onClose();
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration }}
        >
          <motion.div
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration }}
          >
            <header>
              <h3>{props.title}</h3>
            </header>
            <div className="modal-body">{props.children}</div>
            <footer>{props.actions}</footer>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function Sheet(props: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  side?: 'left' | 'right';
  transitionPreset?: 'gentle' | 'snappy';
  preventClose?: boolean;
}) {
  const duration = props.transitionPreset === 'snappy' ? 0.14 : 0.22;
  const side = props.side === 'left' ? -20 : 20;

  return (
    <AnimatePresence>
      {props.open ? (
        <motion.div
          className="sheet-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (props.preventClose) return;
            props.onClose();
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration }}
        >
          <motion.aside
            className={cn('sheet-content', props.side === 'left' ? 'sheet-left' : 'sheet-right')}
            onClick={(event) => event.stopPropagation()}
            initial={{ opacity: 0, x: side }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: side }}
            transition={{ duration }}
          >
            <header className="sheet-header">
              <h3>{props.title}</h3>
              <button
                type="button"
                className="icon-btn"
                onClick={props.onClose}
                disabled={props.preventClose}
                aria-label="Tutup panel"
                title="Tutup panel"
              >
                <PanelRightClose size={16} />
              </button>
            </header>
            {props.children}
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

export function Tabs(props: {
  defaultValue: string;
  children: ReactNode;
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const [innerValue, setInnerValue] = useState(props.defaultValue);
  const value = props.value ?? innerValue;

  function setValue(next: string) {
    if (props.onValueChange) {
      props.onValueChange(next);
      return;
    }
    setInnerValue(next);
  }

  return <TabsContext.Provider value={{ value, setValue }}>{props.children}</TabsContext.Provider>;
}

export function TabsList({ children }: { children: ReactNode }) {
  return <div className="tabs-list">{children}</div>;
}

export function TabsTrigger(props: { value: string; children: ReactNode }) {
  const context = useContext(TabsContext);
  if (!context) return null;

  return (
    <button
      type="button"
      className={context.value === props.value ? 'tabs-trigger tabs-trigger-active' : 'tabs-trigger'}
      onClick={() => context.setValue(props.value)}
    >
      {props.children}
    </button>
  );
}

export function TabsContent(props: { value: string; children: ReactNode }) {
  const context = useContext(TabsContext);
  if (!context || context.value !== props.value) return null;
  return <div className="tabs-content">{props.children}</div>;
}

export interface StepperStep {
  value: string;
  label: string;
  description?: string;
}

export function Stepper(props: {
  steps: StepperStep[];
  activeValue: string;
  onStepSelect?: (value: string) => void;
}) {
  const activeIndex = props.steps.findIndex((step) => step.value === props.activeValue);

  return (
    <ol className="stepper-list">
      {props.steps.map((step, index) => {
        const isActive = step.value === props.activeValue;
        const isDone = activeIndex > index;
        return (
          <li key={step.value} className={cn('stepper-item', isActive ? 'stepper-item-active' : '', isDone ? 'stepper-item-done' : '')}>
            <button
              type="button"
              className="stepper-button"
              onClick={() => props.onStepSelect?.(step.value)}
              disabled={!props.onStepSelect}
            >
              <span className="stepper-dot">{index + 1}</span>
              <span className="stepper-copy">
                <strong>{step.label}</strong>
                {step.description ? <small>{step.description}</small> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function Tooltip(props: { content: ReactNode; children: ReactNode }) {
  return (
    <span className="tooltip-wrap">
      <span className="tooltip-trigger">{props.children}</span>
      <span className="tooltip-content">{props.content}</span>
    </span>
  );
}

export function Popover(props: { trigger: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="popover-wrap" ref={containerRef}>
      <button type="button" className="popover-trigger" onClick={() => setOpen((prev) => !prev)}>
        {props.trigger}
      </button>
      {open ? <div className="popover-panel">{props.children}</div> : null}
    </div>
  );
}

export function Dropdown(props: {
  label: ReactNode;
  items: Array<{ label: string; onSelect: () => void; disabled?: boolean }>;
}) {
  return (
    <Popover
      trigger={
        <span className="dropdown-label">
          {props.label}
          <ChevronDown size={14} />
        </span>
      }
    >
      <div className="dropdown-menu">
        {props.items.map((item) => (
          <button
            key={item.label}
            type="button"
            className="dropdown-item"
            onClick={item.onSelect}
            disabled={item.disabled}
          >
            {item.label}
          </button>
        ))}
      </div>
    </Popover>
  );
}

export interface TableColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  accessor: (row: T) => ReactNode;
  sortAccessor?: (row: T) => string | number;
}

export function Table<T extends { id?: string }>(props: {
  title?: string;
  rows: T[];
  columns: Array<TableColumn<T>>;
  loading?: boolean;
  pageSizeOptions?: number[];
  initialPageSize?: number;
  searchPlaceholder?: string;
  searchAccessor?: (row: T) => string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(props.initialPageSize ?? 10);
  const [query, setQuery] = useState('');

  const pageSizeOptions = props.pageSizeOptions ?? [5, 10, 20, 50];

  const filtered = useMemo(() => {
    if (!query.trim()) return props.rows;
    const keyword = query.toLowerCase();
    return props.rows.filter((row) => {
      if (props.searchAccessor) {
        return props.searchAccessor(row).toLowerCase().includes(keyword);
      }
      return JSON.stringify(row).toLowerCase().includes(keyword);
    });
  }, [props.rows, query, props.searchAccessor]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const column = props.columns.find((item) => item.key === sortKey);
    if (!column) return filtered;

    return [...filtered].sort((left, right) => {
      const leftValue = column.sortAccessor ? column.sortAccessor(left) : String(column.accessor(left));
      const rightValue = column.sortAccessor ? column.sortAccessor(right) : String(column.accessor(right));

      if (leftValue < rightValue) return sortDirection === 'asc' ? -1 : 1;
      if (leftValue > rightValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortDirection, sortKey, props.columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [safePage, pageSize, sorted]);

  useEffect(() => {
    setPage(1);
  }, [query, sortKey, sortDirection, pageSize, props.rows.length]);

  function handleSort(column: TableColumn<T>) {
    if (!column.sortable) return;

    if (sortKey !== column.key) {
      setSortKey(column.key);
      setSortDirection('asc');
      return;
    }

    setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  }

  return (
    <div className="table-card">
      <div className="table-toolbar">
        {props.title ? <h3>{props.title}</h3> : <div />}
        <div className="table-toolbar-right">
          <Input
            value={query}
            onChange={setQuery}
            placeholder={props.searchPlaceholder ?? 'Cari data...'}
          />
          <Select
            value={String(pageSize)}
            onChange={(value) => setPageSize(Number(value))}
            options={pageSizeOptions.map((item) => ({ label: `${item} baris/halaman`, value: String(item) }))}
          />
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {props.columns.map((column) => (
                <th
                  key={column.key}
                  className={column.sortable ? 'th-sortable' : ''}
                  onClick={() => handleSort(column)}
                >
                  <span>
                    {column.header}
                    {sortKey === column.key ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.loading
              ? Array.from({ length: Math.max(3, pageSize) }).map((_, index) => (
                  <tr key={`skeleton-${index}`}>
                    {props.columns.map((column) => (
                      <td key={column.key}>
                        <span className="skeleton-line" />
                      </td>
                    ))}
                  </tr>
                ))
              : null}

            {!props.loading && pagedRows.length === 0 ? (
              <tr>
                <td colSpan={props.columns.length}>
                  <EmptyState
                    title={props.emptyTitle ?? 'Tidak ada data'}
                    description={props.emptyDescription ?? 'Belum ada data yang dapat ditampilkan.'}
                  />
                </td>
              </tr>
            ) : null}

            {!props.loading
              ? pagedRows.map((row, index) => (
                  <tr key={(row.id ? String(row.id) : `row-${index}`) + String(index)}>
                    {props.columns.map((column) => (
                      <td key={column.key}>{column.accessor(row)}</td>
                    ))}
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>

      <div className="table-pagination">
        <small>
          Menampilkan {(safePage - 1) * pageSize + (pagedRows.length > 0 ? 1 : 0)}-
          {(safePage - 1) * pageSize + pagedRows.length} dari {sorted.length} data
        </small>
        <div className="action-row">
          <Button variant="ghost" size="sm" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={safePage <= 1}>
            <ChevronLeft size={14} /> Sebelumnya
          </Button>
          <Badge tone="neutral">
            {safePage}/{totalPages}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={safePage >= totalPages}
          >
            Berikutnya <ChevronRight size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}

export interface TimelineItem {
  id: string;
  title: string;
  description?: string;
  meta?: string;
  badge?: ReactNode;
  actions?: ReactNode;
}

export function Timeline(props: { items: TimelineItem[]; emptyTitle?: string; emptyDescription?: string }) {
  if (props.items.length === 0) {
    return (
      <EmptyState
        title={props.emptyTitle ?? 'Linimasa kosong'}
        description={props.emptyDescription ?? 'Belum ada aktivitas untuk ditampilkan.'}
      />
    );
  }

  return (
    <ul className="timeline-list">
      {props.items.map((item) => (
        <li key={item.id} className="timeline-item">
          <div>
            <strong>{item.title}</strong>
            {item.description ? <p>{item.description}</p> : null}
            {item.meta ? <small>{item.meta}</small> : null}
          </div>
          <div className="action-row">
            {item.badge}
            {item.actions}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ThemeToggle({ mode, onToggle }: { mode: 'dark' | 'light'; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label="Ubah tema"
      onClick={onToggle}
      title="Ubah tema"
    >
      <span className={cn('theme-knob', mode === 'light' ? 'theme-knob-light' : 'theme-knob-dark')}>
        {mode === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
      </span>
      <span>{mode === 'dark' ? 'Gelap' : 'Terang'}</span>
    </button>
  );
}

interface ToastItem {
  id: number;
  message: string;
  tone: 'success' | 'error' | 'info';
}

const ToastContext = createContext<{
  pushToast: (message: string, tone?: 'success' | 'error' | 'info') => void;
}>({
  pushToast: () => undefined
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const value = useMemo(
    () => ({
      pushToast: (message: string, tone: 'success' | 'error' | 'info' = 'info') => {
        const item: ToastItem = {
          id: Date.now() + Math.floor(Math.random() * 1000),
          message,
          tone
        };
        setToasts((prev) => [...prev, item]);
        setTimeout(() => {
          setToasts((prev) => prev.filter((toast) => toast.id !== item.id));
        }, 3500);
      }
    }),
    []
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={cn('toast', `toast-${toast.tone}`)}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
