import axios from 'axios';
import type {
  AuditCoverageResponse,
  AuditEntry,
  BasicUser,
  ClassRecapResponse,
  DashboardData,
  GeofencePolicy,
  LiveFeedResponse,
  LoginResponse,
  PaginatedResponse,
  ReconciliationFlag,
  SchoolClass,
  SessionItem,
  SessionRoster,
  StudentRecapResponse,
  Subject,
  SubjectRecapResponse,
  TeacherMonthlyResponse,
  TeacherRecapResponse,
  TrendResponse
} from '../types/domain';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
const ACCESS_TOKEN_KEY = 'schoolhub_access_token';

export const api = axios.create({
  baseURL,
  timeout: 15000
});

function readStoredAccessToken() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

const bootToken = readStoredAccessToken();
if (bootToken) {
  api.defaults.headers.common.Authorization = `Bearer ${bootToken}`;
}

api.interceptors.request.use((config) => {
  const hasAuthorization =
    typeof config.headers?.Authorization === 'string' && config.headers.Authorization.length > 0;
  if (hasAuthorization) {
    return config;
  }

  const token = readStoredAccessToken();
  if (!token) {
    return config;
  }

  config.headers = config.headers ?? {};
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function isPaginatedResponse<T>(value: unknown): value is PaginatedResponse<T> {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.items) && typeof record.meta === 'object';
}

function unwrapItems<T>(value: T[] | PaginatedResponse<T>): T[] {
  return Array.isArray(value) ? value : value.items;
}

export function setAccessToken(token: string | null) {
  if (!token) {
    delete api.defaults.headers.common.Authorization;
    return;
  }
  api.defaults.headers.common.Authorization = `Bearer ${token}`;
}

export async function login(username: string, password: string) {
  const response = await api.post<LoginResponse>('/auth/login', { username, password });
  return response.data;
}

export async function getDashboard(date?: string) {
  const response = await api.get<DashboardData>('/reports/dashboard', { params: { date } });
  return response.data;
}

export async function getTrend(days = 7) {
  const response = await api.get<TrendResponse>('/reports/trend', { params: { days } });
  return response.data;
}

export async function getLiveMonitor(limit = 120) {
  const response = await api.get<LiveFeedResponse>('/reports/live-monitor', {
    params: { page: 1, limit }
  });
  return response.data;
}

export function openLiveMonitorStream(params: {
  token: string;
  limit?: number;
  onMessage: (data: LiveFeedResponse) => void;
  onError?: (event: Event) => void;
}) {
  const query = new URLSearchParams({
    token: params.token,
    limit: String(params.limit ?? 120)
  });
  const streamUrl = `${baseURL.replace(/\/$/, '')}/reports/live-monitor/stream?${query.toString()}`;
  const source = new EventSource(streamUrl);

  source.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data) as Record<string, unknown>;
      const payload =
        parsed && typeof parsed === 'object' && parsed.data && typeof parsed.data === 'object'
          ? (parsed.data as Record<string, unknown>)
          : parsed;

      if (!payload || !Array.isArray(payload.items)) {
        return;
      }
      params.onMessage(payload as unknown as LiveFeedResponse);
    } catch {
      // ignore malformed stream payload
    }
  };

  source.onerror = (event) => {
    if (params.onError) {
      params.onError(event);
    }
  };

  return source;
}

export async function listClassSessions(date?: string) {
  const response = await api.get<SessionItem[] | PaginatedResponse<SessionItem>>('/attendance/class-sessions', {
    params: { date, page: 1, limit: 200 }
  });
  return unwrapItems(response.data);
}

export async function openSession(sessionId: string, lat?: number, lng?: number) {
  const response = await api.post(
    `/attendance/class-sessions/${sessionId}/open`,
    lat !== undefined && lng !== undefined ? { lat, lng } : undefined
  );
  return response.data;
}

export async function closeSession(sessionId: string) {
  const response = await api.post(`/attendance/class-sessions/${sessionId}/close`);
  return response.data;
}

export async function getSessionRoster(sessionId: string) {
  const response = await api.get<SessionRoster>(`/attendance/class-sessions/${sessionId}/roster`);
  return response.data;
}

export async function saveAttendanceBatch(
  sessionId: string,
  items: Array<{ studentId: string; status: string; note?: string }>
) {
  const response = await api.put(`/attendance/class-sessions/${sessionId}/attendance`, { items });
  return response.data;
}

export async function correctAttendance(
  sessionId: string,
  studentId: string,
  payload: { status: string; reason: string; note?: string }
) {
  const response = await api.patch(`/attendance/class-sessions/${sessionId}/attendance/${studentId}`, payload);
  return response.data;
}

export async function getSessionSummary(sessionId: string) {
  const response = await api.get(`/attendance/class-sessions/${sessionId}/summary`);
  return response.data;
}

export async function listFlags(options?: {
  status?: string;
  type?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}) {
  const response = await api.get<ReconciliationFlag[] | PaginatedResponse<ReconciliationFlag>>(
    '/reconciliation/flags',
    {
      params: {
        status: options?.status,
        type: options?.type,
        from: options?.from,
        to: options?.to,
        page: options?.page ?? 1,
        limit: options?.limit ?? 200
      }
    }
  );
  return unwrapItems(response.data);
}

export async function resolveFlag(flagId: string, reason: string) {
  const response = await api.post(`/reconciliation/flags/${flagId}/resolve`, { reason });
  return response.data;
}

export async function escalateFlag(flagId: string, reason: string) {
  const response = await api.post(`/reconciliation/flags/${flagId}/escalate`, { reason });
  return response.data;
}

export async function listGateLogs(date?: string) {
  const response = await api.get('/attendance/gate/logs', { params: { date, page: 1, limit: 200 } });
  return isPaginatedResponse(response.data) ? response.data.items : response.data;
}

export async function listSchedules(date?: string, teacherId?: string, classId?: string) {
  const response = await api.get('/schedules/sessions', {
    params: { date, teacherId, classId, page: 1, limit: 200 }
  });
  return isPaginatedResponse(response.data) ? response.data.items : response.data;
}

export async function createSchedule(payload: {
  classId: string;
  subjectId: string;
  teacherId: string;
  startsAt: string;
  endsAt: string;
}) {
  const response = await api.post('/schedules/sessions', payload);
  return response.data;
}

export async function updateSchedule(sessionId: string, payload: { startsAt: string; endsAt: string }) {
  const response = await api.patch(`/schedules/sessions/${sessionId}`, payload);
  return response.data;
}

export async function listUsers() {
  const response = await api.get<BasicUser[] | PaginatedResponse<BasicUser>>('/identity/users', {
    params: { page: 1, limit: 200 }
  });
  return isPaginatedResponse(response.data) ? response.data.items : response.data;
}

export async function createUser(payload: {
  username: string;
  fullName: string;
  password: string;
  role: string;
  cardStatus: string;
}) {
  const response = await api.post('/identity/users', payload);
  return response.data;
}

export async function getMe() {
  const response = await api.get('/identity/me');
  return response.data;
}

export async function updateMe(fullName: string) {
  const response = await api.patch('/identity/me', { fullName });
  return response.data;
}

export async function listClasses() {
  const response = await api.get<SchoolClass[] | PaginatedResponse<SchoolClass>>('/academic/classes', {
    params: { page: 1, limit: 200 }
  });
  return isPaginatedResponse(response.data) ? response.data.items : response.data;
}

export async function createClass(payload: { code: string; name: string; yearLabel: string }) {
  const response = await api.post('/academic/classes', payload);
  return response.data;
}

export async function listSubjects() {
  const response = await api.get<Subject[] | PaginatedResponse<Subject>>('/academic/subjects', {
    params: { page: 1, limit: 200 }
  });
  return isPaginatedResponse(response.data) ? response.data.items : response.data;
}

export async function createSubject(payload: { code: string; name: string }) {
  const response = await api.post('/academic/subjects', payload);
  return response.data;
}

export async function listStudents(classId?: string) {
  const response = await api.get('/academic/students', {
    params: { classId, page: 1, limit: 200 }
  });
  return isPaginatedResponse(response.data) ? response.data.items : response.data;
}

export async function enrollStudent(payload: { userId: string; classId: string }) {
  const response = await api.post('/academic/enrollments', payload);
  return response.data;
}

export async function getGeofencePolicy() {
  const response = await api.get<GeofencePolicy>('/access/geofence');
  return response.data;
}

export async function updateGeofencePolicy(payload: {
  centerLat: number;
  centerLng: number;
  radiusMeter: number;
  enforceSessionOpen: boolean;
  arrivalGraceMinutes: number;
  autoMissedGraceMinutes: number;
  requireGateTapForOpen: boolean;
  allowPicketOverride: boolean;
}) {
  const response = await api.put<GeofencePolicy>('/access/geofence', payload);
  return response.data;
}

export async function listReaders() {
  const response = await api.get('/devices/readers', { params: { page: 1, limit: 200 } });
  return isPaginatedResponse(response.data) ? response.data.items : response.data;
}

export async function createReader(payload: { name: string; locationLat?: number; locationLng?: number }) {
  const response = await api.post('/devices/readers', payload);
  return response.data;
}

export async function rotateReaderKey(id: string) {
  const response = await api.post(`/devices/readers/${id}/rotate-key`);
  return response.data;
}

export async function updateReaderStatus(id: string, status: string) {
  const response = await api.patch(`/devices/readers/${id}/status`, { status });
  return response.data;
}

export async function listSmartCards() {
  const response = await api.get('/devices/cards', { params: { page: 1, limit: 200 } });
  return isPaginatedResponse(response.data) ? response.data.items : response.data;
}

export async function createSmartCard(payload: {
  uid: string;
  userId?: string;
  status?: string;
  note?: string;
}) {
  const response = await api.post('/devices/cards', payload);
  return response.data;
}

export async function updateSmartCard(
  id: string,
  payload: { uid?: string; userId?: string | null; status?: string; note?: string }
) {
  const response = await api.patch(`/devices/cards/${id}`, payload);
  return response.data;
}

export async function listAudit(options?: {
  page?: number;
  limit?: number;
  actorId?: string;
  from?: string;
  to?: string;
  module?: string;
  action?: string;
}) {
  const response = await api.get<PaginatedResponse<AuditEntry>>('/audit', {
    params: {
      page: options?.page ?? 1,
      limit: options?.limit ?? 50,
      actorId: options?.actorId,
      from: options?.from,
      to: options?.to,
      module: options?.module,
      action: options?.action
    }
  });
  return response.data;
}

export async function getClassMonthly(classId: string, month: string) {
  const response = await api.get(`/reports/class/${classId}/monthly`, { params: { month } });
  return response.data;
}

export async function getMyAttendance(days = 30) {
  const response = await api.get('/reports/my-attendance', { params: { days } });
  return response.data;
}

interface ReportFilters {
  from?: string;
  to?: string;
  classId?: string;
  subjectId?: string;
  teacherId?: string;
  studentId?: string;
  month?: string;
  page?: number;
  limit?: number;
}

function buildReportParams(filters?: ReportFilters) {
  return {
    from: filters?.from,
    to: filters?.to,
    classId: filters?.classId,
    subjectId: filters?.subjectId,
    teacherId: filters?.teacherId,
    studentId: filters?.studentId,
    month: filters?.month,
    page: filters?.page ?? 1,
    limit: filters?.limit ?? 50
  };
}

export async function getRecapClasses(filters?: ReportFilters) {
  const response = await api.get<ClassRecapResponse>('/reports/recap/classes', {
    params: buildReportParams(filters)
  });
  return response.data;
}

export async function getRecapStudents(filters?: ReportFilters) {
  const response = await api.get<StudentRecapResponse>('/reports/recap/students', {
    params: buildReportParams(filters)
  });
  return response.data;
}

export async function getRecapSubjects(filters?: ReportFilters) {
  const response = await api.get<SubjectRecapResponse>('/reports/recap/subjects', {
    params: buildReportParams(filters)
  });
  return response.data;
}

export async function getRecapTeachers(filters?: ReportFilters) {
  const response = await api.get<TeacherRecapResponse>('/reports/recap/teachers', {
    params: buildReportParams(filters)
  });
  return response.data;
}

export async function getTeacherMonthly(filters?: ReportFilters) {
  const response = await api.get<TeacherMonthlyResponse>('/reports/teacher-monthly', {
    params: buildReportParams(filters)
  });
  return response.data;
}

export async function getAuditCoverage(filters?: ReportFilters) {
  const response = await api.get<AuditCoverageResponse>('/reports/audit-coverage', {
    params: buildReportParams(filters)
  });
  return response.data;
}

export async function downloadReport(params: {
  reportType: 'recap_classes' | 'recap_students' | 'recap_subjects' | 'recap_teachers' | 'teacher_monthly' | 'audit_coverage';
  format: 'csv' | 'xlsx';
  from?: string;
  to?: string;
  classId?: string;
  subjectId?: string;
  teacherId?: string;
  studentId?: string;
  month?: string;
}) {
  const response = await api.get<ArrayBuffer>('/reports/export', {
    params,
    responseType: 'arraybuffer'
  });

  const contentType = String(response.headers['content-type'] ?? 'application/octet-stream');
  const contentDisposition = String(response.headers['content-disposition'] ?? '');
  const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);

  return {
    blob: new Blob([response.data], { type: contentType }),
    filename: filenameMatch?.[1] ?? `${params.reportType}.${params.format}`
  };
}
