import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DeviceReaderStatus, Prisma, ReaderType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const DEFAULT_SKEW_MS = Number(process.env.READER_SIGNATURE_SKEW_MS || String(2 * 60 * 1000));
const DEFAULT_NONCE_TTL_MS = Number(process.env.READER_NONCE_TTL_MS || String(5 * 60 * 1000));
const MAX_READER_IDENTIFIER_LENGTH = 256;
const READER_LOOKUP_LIMIT = 20;
const DIGEST_HEX_PATTERN = /^[a-f0-9]{64}$/;
const AES_GCM_IV_LENGTH_BYTES = 12;
const AES_GCM_AUTH_TAG_LENGTH_BYTES = 16;

export interface ReaderSignatureHeaders {
  deviceId?: string;
  timestamp?: string;
  nonce?: string;
  bodyHash?: string;
  signature?: string;
}

export function sha256Hex(input: string | Buffer) {
  return createHash('sha256').update(input).digest('hex');
}

function readerCredentialKey() {
  const material = process.env.READER_API_KEY_HASH_SECRET || process.env.READER_SECRET_ENCRYPTION_KEY || process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-only-reader-credential-key-minimum-32-chars');
  if (!material || material.length < 32) {
    throw new Error('Reader credential hash secret wajib tersedia dan minimal 32 karakter.');
  }
  return createHash('sha256').update(`schoolhub-reader-credential:${material}`).digest();
}

export function readerCredentialDigest(input: string | Buffer) {
  return createHmac('sha256', readerCredentialKey()).update(input).digest('hex');
}

export function safeDigestEqual(left?: string | null, right?: string | null) {
  if (!left || !right) return false;
  const normalizedLeft = String(left).trim().toLowerCase();
  const normalizedRight = String(right).trim().toLowerCase();
  if (!DIGEST_HEX_PATTERN.test(normalizedLeft) || !DIGEST_HEX_PATTERN.test(normalizedRight)) return false;
  const leftBuffer = Buffer.from(normalizedLeft, 'hex');
  const rightBuffer = Buffer.from(normalizedRight, 'hex');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function readerCredentialDigestCandidates(input: string | Buffer) {
  const candidates = new Set<string>();
  candidates.add(readerCredentialDigest(input));
  // Temporary transition compatibility: existing production rows may still store legacy plain SHA-256.
  // New credentials must be stored with readerCredentialDigest only.
  candidates.add(sha256Hex(input));
  return [...candidates];
}

export function normalizedReaderIdentifier(value: string | null | undefined) {
  const identifier = String(value || '').trim();
  return identifier && identifier.length <= MAX_READER_IDENTIFIER_LENGTH ? identifier : '';
}

export function readerIdentityWhere(...identifiers: Array<string | null | undefined>): Prisma.DeviceReaderWhereInput {
  const seen = new Set<string>();
  const OR: Prisma.DeviceReaderWhereInput[] = [];
  for (const value of identifiers) {
    const identifier = normalizedReaderIdentifier(value);
    if (!identifier || seen.has(identifier)) continue;
    seen.add(identifier);
    OR.push({ id: identifier }, { deviceId: identifier });
    for (const apiKeyHash of readerCredentialDigestCandidates(identifier)) OR.push({ apiKeyHash });
  }
  return OR.length > 0 ? { OR } : { id: '__never_match_reader__' };
}

export function readerCandidateWhere(identifierInput: string | null | undefined): Prisma.DeviceReaderWhereInput {
  const identifier = normalizedReaderIdentifier(identifierInput);
  if (!identifier) return { id: '__never_match_reader__' };
  const base = readerIdentityWhere(identifier);
  const OR = 'OR' in base && Array.isArray(base.OR) ? [...base.OR] : [base];
  if (identifier.length >= 11) OR.push({ keyPrefix: identifier.slice(0, 7), keyLast4: identifier.slice(-4) });
  return { OR };
}

export function credentialHashMatches(credential: string | null | undefined, storedHash: string | null | undefined) {
  const normalized = normalizedReaderIdentifier(credential);
  if (!normalized || !storedHash) return false;
  return readerCredentialDigestCandidates(normalized).some((candidate) => safeDigestEqual(candidate, storedHash));
}

export function readerMatchesIdentifier<T extends { id: string; deviceId?: string | null; apiKeyHash?: string | null }>(reader: T, identifierInput: string | null | undefined) {
  const identifier = normalizedReaderIdentifier(identifierInput);
  if (!identifier) return false;
  if (reader.id === identifier || reader.deviceId === identifier) return true;
  return credentialHashMatches(identifier, reader.apiKeyHash);
}

export type UniqueReaderMatchResult<T> =
  | { status: 'matched'; reader: T }
  | { status: 'not_found' | 'ambiguous' | 'too_many_candidates' };

export function uniqueReaderMatch<T extends { id: string; deviceId?: string | null; apiKeyHash?: string | null }>(candidates: T[], identifierInput: string | null | undefined): UniqueReaderMatchResult<T> {
  if (candidates.length >= READER_LOOKUP_LIMIT) return { status: 'too_many_candidates' };
  const matches = new Map<string, T>();
  for (const candidate of candidates) {
    if (readerMatchesIdentifier(candidate, identifierInput)) matches.set(candidate.id, candidate);
  }
  if (matches.size === 0) return { status: 'not_found' };
  if (matches.size > 1) return { status: 'ambiguous' };
  return { status: 'matched', reader: [...matches.values()][0] };
}

export function readerLookupLimit() {
  return READER_LOOKUP_LIMIT;
}

function hmacHex(secret: string, payload: string) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function safeEqualHex(left: string, right: string) {
  return safeDigestEqual(left, right);
}

function encryptionKey() {
  const material = process.env.READER_SECRET_ENCRYPTION_KEY || process.env.JWT_SECRET || 'dev-only-reader-secret-key';
  return createHash('sha256').update(material).digest();
}

@Injectable()
export class DeviceSignatureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  generateReaderSecret() {
    return `shrsec_${randomBytes(32).toString('base64url')}`;
  }

  encryptSecret(secret: string) {
    const iv = randomBytes(AES_GCM_IV_LENGTH_BYTES);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv, { authTagLength: AES_GCM_AUTH_TAG_LENGTH_BYTES });
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
  }

  decryptSecret(ciphertext?: string | null) {
    if (!ciphertext) return null;
    const [version, ivRaw, tagRaw, dataRaw] = ciphertext.split(':');
    if (version !== 'v1' || !ivRaw || !tagRaw || !dataRaw) return null;
    const iv = Buffer.from(ivRaw, 'base64url');
    const tag = Buffer.from(tagRaw, 'base64url');
    if (iv.length !== AES_GCM_IV_LENGTH_BYTES || tag.length !== AES_GCM_AUTH_TAG_LENGTH_BYTES) return null;
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv, { authTagLength: AES_GCM_AUTH_TAG_LENGTH_BYTES });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(dataRaw, 'base64url')), decipher.final()]).toString('utf8');
  }

  canonicalSignaturePayload(method: string, path: string, timestamp: string, nonce: string, bodyHash: string) {
    return [method.toUpperCase(), path, timestamp, nonce, bodyHash].join('\n');
  }

  async assertValidSignedReaderRequest(args: {
    method: string;
    path: string;
    rawBody: string;
    expectedType?: ReaderType;
    minSupportedVersionCode?: number;
    appVersionCode?: number;
    headers: ReaderSignatureHeaders;
  }) {
    const deviceId = args.headers.deviceId?.trim();
    const timestamp = args.headers.timestamp?.trim();
    const nonce = args.headers.nonce?.trim();
    const bodyHash = args.headers.bodyHash?.trim().toLowerCase();
    const signature = args.headers.signature?.trim().toLowerCase();

    if (!deviceId || !timestamp || !nonce || !bodyHash || !signature) {
      throw new UnauthorizedException('Header signature reader tidak lengkap.');
    }

    if (!/^[a-f0-9]{64}$/.test(bodyHash) || !/^[a-f0-9]{64}$/.test(signature)) {
      throw new UnauthorizedException('Format signature reader tidak valid.');
    }

    const parsedTimestamp = new Date(timestamp);
    if (Number.isNaN(parsedTimestamp.getTime())) throw new UnauthorizedException('Timestamp reader tidak valid.');
    if (Math.abs(Date.now() - parsedTimestamp.getTime()) > DEFAULT_SKEW_MS) {
      throw new UnauthorizedException('Timestamp reader terlalu jauh dari waktu server.');
    }

    const actualBodyHash = sha256Hex(args.rawBody || '{}');
    if (!safeEqualHex(actualBodyHash, bodyHash)) {
      throw new BadRequestException('Body hash tidak cocok.');
    }

    const readers = await this.prisma.deviceReader.findMany({ where: readerCandidateWhere(deviceId), take: readerLookupLimit() });
    const match = uniqueReaderMatch(readers, deviceId);
    if (match.status !== 'matched') {
      throw new ForbiddenException('Reader tidak aktif, dicabut, atau tidak ditemukan.');
    }
    const reader = match.reader;
    if (reader.status !== DeviceReaderStatus.ACTIVE) {
      throw new ForbiddenException('Reader tidak aktif, dicabut, atau tidak ditemukan.');
    }
    if (reader.revokedAt) {
      throw new ForbiddenException('Reader sudah dicabut.');
    }
    if (args.expectedType && reader.type !== args.expectedType) {
      throw new ForbiddenException('Tipe reader tidak sesuai.');
    }
    if (args.minSupportedVersionCode && args.appVersionCode && args.appVersionCode < args.minSupportedVersionCode) {
      throw new ForbiddenException('Versi aplikasi reader sudah tidak didukung.');
    }

    const secret = this.decryptSecret(reader.readerSecretCiphertext);
    if (!secret) {
      throw new ForbiddenException('Reader belum memiliki secret signed request.');
    }

    const expectedSignature = hmacHex(secret, this.canonicalSignaturePayload(args.method, args.path, timestamp, nonce, bodyHash));
    if (!safeEqualHex(expectedSignature, signature)) {
      throw new UnauthorizedException('Signature reader tidak valid.');
    }

    const nonceHash = sha256Hex(nonce);
    const nonceKey = `schoolhub:reader-nonce:${reader.id}:${nonceHash}`;
    const claimed = await this.redis.setNxPx(nonceKey, '1', DEFAULT_NONCE_TTL_MS);
    if (claimed === false) throw new UnauthorizedException('Nonce reader sudah pernah dipakai.');
    if (claimed === null) throw new ServiceUnavailableException('Penyimpanan nonce reader tidak tersedia.');

    return { reader, timestamp: parsedTimestamp, nonceHash, bodyHash };
  }
}
