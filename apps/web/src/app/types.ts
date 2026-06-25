import type { ReactNode } from 'react';

export type Role = 'ADMIN_TU' | 'KEPALA_SEKOLAH' | 'OPERATOR_IT' | 'GURU_MAPEL' | 'GURU_PIKET' | 'SISWA' | 'DEVELOPER';
export type RouteArea = 'admin' | 'guru' | 'siswa' | 'public';
export type AttendanceStatus = 'HADIR' | 'TELAT' | 'IZIN' | 'SAKIT' | 'ALPA';

export interface User {
  id?: string;
  username?: string;
  fullName?: string;
  role?: Role | string;
  cardStatus?: string;
  active?: boolean;
  mustChangePassword?: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface PaginationMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

export interface ApiState<T = unknown> {
  loading: boolean;
  error: string;
  data: T | null;
  refresh: () => void;
}

export interface Column<T = Record<string, unknown>> {
  header: string;
  key?: keyof T | string;
  render?: (row: T, index: number) => ReactNode;
}

export interface ToastMessage {
  id?: number;
  message: string;
  type?: 'ok' | 'bad' | 'warn' | string;
}

export interface ConfirmDialogState {
  title: string;
  message: string;
  resolve: (value: boolean) => void;
}

export interface ClassSession {
  id: string;
  status?: string;
  startsAt?: string;
  endsAt?: string;
  schoolClass?: { id?: string; code?: string; name?: string };
  subject?: { id?: string; code?: string; name?: string };
  teacher?: { id?: string; fullName?: string };
}

export interface PicketNote {
  id: string;
  date: string;
  title: string;
  body: string;
  category: string;
  severity: string;
  active?: boolean;
  createdBy?: User;
}

export interface SmartCard {
  id: string;
  uid: string;
  status?: string;
  userId?: string | null;
  user?: User;
  note?: string;
  lastTappedAt?: string | null;
}

export interface Reader {
  id: string;
  name: string;
  status?: string;
  lastSeenAt?: string | null;
}

export interface AuditEntry {
  id: string;
  module?: string;
  action?: string;
  resource?: string;
  resourceId?: string;
  reason?: string;
  createdAt?: string;
  actor?: User;
  actorId?: string;
  after?: Record<string, unknown>;
}

export interface ImportPreviewRow {
  index?: number;
  username?: string;
  code?: string;
  classCode?: string;
  errors?: string[];
}

export interface ImportPreviewResult {
  summary?: { total?: number; valid?: number; invalid?: number; created?: number; upserted?: number };
  rows?: ImportPreviewRow[];
  items?: ImportPreviewRow[];
  committed?: boolean;
}
