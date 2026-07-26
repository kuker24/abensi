import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { mkdir, open, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type LeaveAttachmentKind = 'medical-letter' | 'medicine-photo';

export interface LeaveUploadFile {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const MAGIC: Array<{ mime: string; ext: string; test: (buf: Buffer) => boolean }> = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', test: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' }
];

export function leaveAttachmentStorageDir() {
  return process.env.LEAVE_ATTACHMENT_DIR || path.resolve(process.cwd(), 'uploads/teacher-leave');
}

export function leaveAttachmentMaxBytes() {
  return Number(process.env.LEAVE_ATTACHMENT_MAX_BYTES || DEFAULT_MAX_BYTES);
}

function detectImage(buffer: Buffer) {
  const match = MAGIC.find((entry) => entry.test(buffer));
  if (!match || !ALLOWED_MIME.has(match.mime)) {
    throw new BadRequestException('Lampiran harus foto JPEG, PNG, atau WebP.');
  }
  return match;
}

function storageKey(kind: LeaveAttachmentKind, ext: string) {
  const token = randomBytes(16).toString('hex');
  return `leave_${kind.replace(/-/g, '_')}_${token}.${ext}`;
}

export function resolveLeaveAttachmentPath(storageKeyValue: string) {
  if (!/^leave_(medical_letter|medicine_photo)_[0-9a-f]{32}\.(jpg|png|webp)$/.test(storageKeyValue)) {
    throw new NotFoundException('Path lampiran tidak valid.');
  }
  const root = path.resolve(leaveAttachmentStorageDir());
  const filePath = path.resolve(root, storageKeyValue);
  if (path.dirname(filePath) !== root) throw new NotFoundException('Path lampiran tidak valid.');
  return filePath;
}

export async function saveLeaveAttachment(kind: LeaveAttachmentKind, file: LeaveUploadFile | undefined, label: string) {
  if (!file?.buffer?.length) throw new BadRequestException(`${label} wajib diunggah.`);
  const max = leaveAttachmentMaxBytes();
  if (file.buffer.length > max) throw new BadRequestException(`${label} maksimal ${Math.floor(max / (1024 * 1024))} MB.`);
  const detected = detectImage(file.buffer);
  const key = storageKey(kind, detected.ext);
  const root = leaveAttachmentStorageDir();
  await mkdir(root, { recursive: true, mode: 0o700 });
  const finalPath = resolveLeaveAttachmentPath(key);
  const tempPath = `${finalPath}.part`;
  try {
    await writeFile(tempPath, file.buffer, { flag: 'wx', mode: 0o600 });
    await rename(tempPath, finalPath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
  return { storageKey: key, mime: detected.mime, size: file.buffer.length };
}

export async function openLeaveAttachmentStream(storageKeyValue: string) {
  const filePath = resolveLeaveAttachmentPath(storageKeyValue);
  const handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => {
    throw new NotFoundException('Lampiran tidak ditemukan.');
  });
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1) throw new NotFoundException('Lampiran tidak ditemukan.');
    const stream = createReadStream(filePath, { fd: handle.fd, autoClose: true });
    return { stream, size: stat.size };
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

export async function deleteLeaveAttachment(storageKeyValue: string | null | undefined) {
  if (!storageKeyValue) return;
  try {
    const filePath = resolveLeaveAttachmentPath(storageKeyValue);
    await unlink(filePath);
  } catch {
    // best-effort cleanup
  }
}
