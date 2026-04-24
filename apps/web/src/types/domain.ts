export type Role = 'ADMIN_TU' | 'GURU_MAPEL' | 'GURU_PIKET' | 'SISWA' | 'OPERATOR_IT';

export type SessionStatus = 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'MISSED';

export type StudentAttendanceStatus = 'HADIR' | 'TELAT' | 'IZIN' | 'SAKIT' | 'ALPA';

export type ReconciliationStatus = 'OPEN' | 'RESOLVED';

export type EscalationStatus = 'QUEUED' | 'CLOSED';

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  role: Role;
}

export interface LoginResponse {
  accessToken: string;
  user: SessionUser;
}

export interface DashboardData {
  date: string;
  sessionsToday: number;
  closedSessions: number;
  attendanceCoveragePercent: number;
  anomalyOpenCount: number;
  gateTapToday: number;
  teacherPresenceCount: number;
}

export interface SchoolClass {
  id: string;
  code: string;
  name: string;
  yearLabel: string;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
}

export interface BasicUser {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  cardStatus?: string;
  active?: boolean;
}

export interface SessionItem {
  id: string;
  startsAt: string;
  endsAt: string;
  status: SessionStatus;
  openedAt?: string | null;
  closedAt?: string | null;
  schoolClass: SchoolClass;
  subject: Subject;
  teacher: BasicUser;
}

export interface RosterItem {
  studentId: string;
  fullName: string;
  username: string;
  cardStatus: string;
  status: StudentAttendanceStatus;
  note?: string | null;
  updatedAt?: string | null;
}

export interface SessionRoster {
  session: {
    id: string;
    status: SessionStatus;
    startsAt: string;
    endsAt: string;
  };
  roster: RosterItem[];
}

export interface TrendItem {
  date: string;
  sessions: number;
  closed: number;
  anomalies: number;
  coveragePercent: number;
}

export interface TrendResponse {
  days: number;
  items: TrendItem[];
}

export interface LiveFeedItem {
  id?: string;
  type: string;
  timestamp: string;
  title: string;
  subtitle: string;
  status: string;
  actorName?: string;
  actorRole?: string;
  actorInitials?: string;
  method?: string;
  result?: string;
  location?: string;
  context?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface LiveFeedResponse {
  items: LiveFeedItem[];
  meta?: PaginationMeta;
}

export interface EscalationQueue {
  id: string;
  status: EscalationStatus;
  reason: string;
  createdAt: string;
  closedAt?: string | null;
  createdBy: {
    id: string;
    fullName: string;
    role: Role;
  };
}

export interface ReconciliationFlag {
  id: string;
  type: string;
  status: ReconciliationStatus;
  createdAt: string;
  resolvedAt?: string | null;
  resolvedReason?: string | null;
  user: BasicUser;
  session?: {
    id: string;
    schoolClass: SchoolClass;
    subject: Subject;
  } | null;
  escalationQueue?: EscalationQueue | null;
}

export interface SmartCard {
  id: string;
  uid: string;
  status: string;
  note?: string | null;
  lastTappedAt?: string | null;
  user?: BasicUser | null;
}

export interface ReaderDevice {
  id: string;
  name: string;
  apiKey: string;
  status: string;
  locationLat?: number | null;
  locationLng?: number | null;
  lastSeenAt?: string | null;
}

export interface GeofencePolicy {
  centerLat: number;
  centerLng: number;
  radiusMeter: number;
  enforceSessionOpen: boolean;
  arrivalGraceMinutes: number;
  autoMissedGraceMinutes: number;
  requireGateTapForOpen: boolean;
  allowPicketOverride: boolean;
}

export interface DateRangePayload {
  from: string;
  to: string;
}

export interface AttendanceCounters {
  HADIR: number;
  TELAT: number;
  IZIN: number;
  SAKIT: number;
  ALPA: number;
}

export interface ClassRecapItem {
  classId: string;
  classCode: string;
  className: string;
  sessionCount: number;
  closedSessions: number;
  attendanceCoveragePercent: number;
  uniqueTeacherCount: number;
  uniqueSubjectCount: number;
  counters: AttendanceCounters;
}

export interface ClassRecapResponse extends PaginatedResponse<ClassRecapItem> {
  range: DateRangePayload;
  summary: {
    classCount: number;
    sessionCount: number;
    closedSessionCount: number;
    attendanceRecords: number;
  };
}

export interface StudentRecapItem {
  studentId: string;
  fullName: string;
  username: string;
  attendanceCount: number;
  presentPercent: number;
  classCodes: string[];
  subjectCodes: string[];
  latestAt?: string | null;
  counters: AttendanceCounters;
}

export interface StudentRecapResponse extends PaginatedResponse<StudentRecapItem> {
  range: DateRangePayload;
  summary: {
    studentCount: number;
    attendanceRecords: number;
  };
}

export interface SubjectRecapItem {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  sessionCount: number;
  closedSessions: number;
  attendanceCoveragePercent: number;
  presencePercent: number;
  classCount: number;
  teacherCount: number;
  counters: AttendanceCounters;
}

export interface SubjectRecapResponse extends PaginatedResponse<SubjectRecapItem> {
  range: DateRangePayload;
  summary: {
    subjectCount: number;
    sessionCount: number;
  };
}

export interface TeacherPresenceCounters {
  HADIR: number;
  TELAT: number;
  EXCUSED_ABSENCE: number;
  ALPA_MENGAJAR: number;
}

export interface TeacherRecapItem {
  teacherId: string;
  fullName: string;
  username: string;
  classCount: number;
  subjectCount: number;
  sessionCount: number;
  closedSessionCount: number;
  sessionCoveragePercent: number;
  presencePercent: number;
  counters: TeacherPresenceCounters;
}

export interface TeacherRecapResponse extends PaginatedResponse<TeacherRecapItem> {
  range: DateRangePayload;
  summary: {
    teacherCount: number;
    sessionCount: number;
    closedSessionCount: number;
  };
}

export interface TeacherMonthlyItem {
  teacherId: string;
  fullName: string;
  username: string;
  month: string;
  sessionCount: number;
  closedSessionCount: number;
  sessionCoveragePercent: number;
  presencePercent: number;
  counters: TeacherPresenceCounters;
}

export interface TeacherMonthlyResponse extends PaginatedResponse<TeacherMonthlyItem> {
  range: DateRangePayload;
  summary: {
    month: string;
    teacherCount: number;
    sessionCount: number;
    closedSessionCount: number;
  };
}

export interface AuditCoverageItem {
  sessionId: string;
  classCode: string;
  subjectCode: string;
  subjectName: string;
  teacherName: string;
  status: SessionStatus;
  startsAt: string;
  expectedActions: string[];
  recordedActions: string[];
  missingActions: string[];
  coveragePercent: number;
}

export interface AuditCoverageResponse extends PaginatedResponse<AuditCoverageItem> {
  range: DateRangePayload;
  summary: {
    sessionCount: number;
    fullyCoveredCount: number;
    averageCoveragePercent: number;
    missingActionCount: number;
  };
}

export interface AuditEntry {
  id: string;
  createdAt: string;
  action: string;
  module?: string | null;
  resource: string;
  resourceId: string;
  reason?: string | null;
  actorRole?: Role | null;
  requestIp?: string | null;
  requestDevice?: string | null;
  actor?: {
    id?: string;
    fullName?: string;
    username?: string;
    role?: Role;
  } | null;
}
