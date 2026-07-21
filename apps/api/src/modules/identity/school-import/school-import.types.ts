import type { Role } from '@prisma/client';

export type SchoolImportSourceKind = 'legacy-siab1' | 'student-class' | 'staff';
export type SchoolImportAction = 'create' | 'update' | 'skip' | 'invalid';
export type SchoolImportSubjectType = 'student' | 'staff';

export interface RawImportRow {
  [key: string]: string | undefined;
}

export interface SchoolImportOptions {
  academicYear?: string;
  updateExisting?: boolean;
  resetPasswordForExisting?: boolean;
}

export interface NormalizedSchoolImportRow {
  index: number;
  source: SchoolImportSourceKind;
  subjectType: SchoolImportSubjectType;
  username: string;
  fullName: string;
  role: Role;
  nis?: string | null;
  nkd?: string | null;
  nip?: string | null;
  birthDate?: string | null;
  classCode?: string | null;
  className?: string | null;
  yearLabel?: string | null;
  jobTitle?: string | null;
  sourceType?: string | null;
  ignoredLegacyPassword: boolean;
  fingerprint: string;
  errors: string[];
  warnings: string[];
}

export interface SchoolImportPreviewRow extends Omit<NormalizedSchoolImportRow, 'fingerprint'> {
  action: SchoolImportAction;
  existingUserId?: string | null;
  passwordWillBeGenerated: boolean;
  passwordWillBeReset: boolean;
}
