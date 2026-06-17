import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { AndroidReaderMode, DeviceReaderStatus, Prisma, ReaderType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const DEFAULT_SKEW_MS = Number(process.env.READER_SIGNATURE_SKEW_MS || String(2 * 60 * 1000));
const DEFAULT_NONCE_TTL_MS = Number(process.env.READER_NONCE_TTL_MS || String(5 * 60 * 1000));
const MAX_READER_IDENTIFIER_LENGTH = 256;
const READER_LOOKUP_LIMIT = 20;
const READER_API_KEY_BCRYPT_ROUNDS = 12;

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
  const material = process.env.READER_API_KEY_HASH_SECRET || process.env.READER_SECRET_ENCRYPTION_KEY || process.env.JWT_SECRET || 'dev-only-reader-credential-key';
  return createHash('sha256').update(`schoolhub-reader-credential:${material}`).digest();
}

export function readerCredentialDigest(input: string | Buffer) {
  return createHmac('sha256', readerCredentialKey()).update(input).digest('hex');
}

export function hashReaderApiKey(apiKey: string) {
  return bcrypt.hashSync(apiKey, READER_API_KEY_BCRYPT_ROUNDS);
}

export function readerCredentialDigestCandidates(input: string | Buffer) {
  const current = readerCredentialDigest(input);
  const legacy = sha256Hex(input);
  return current === legacy ? [current] : [current, legacy];
}

function normalizedReaderIdentifier(value: string | null | undefined) {
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

export function readerMatchesIdentifier<T extends { id: string; deviceId?: string | null; apiKeyHash?: string | null }>(reader: T, identifierInput: string | null | undefined) {
  const identifier = normalizedReaderIdentifier(identifierInput);
  if (!identifier) return false;
  if (reader.id === identifier || reader.deviceId === identifier) return true;
  if (!reader.apiKeyHash) return false;
  if (/^\$2[aby]\$\d{2}\$/.test(reader.apiKeyHash)) {
    try {
      return bcrypt.compareSync(identifier, reader.apiKeyHash);
    } catch {
      return false;
    }
  }
  return readerCredentialDigestCandidates(identifier).includes(reader.apiKeyHash);
}

export function readerLookupLimit() {
  return READER_LOOKUP_LIMIT;
}

function hmacHex(secret: string, payload: string) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function safeEqualHex(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
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
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
  }

  decryptSecret(ciphertext?: string | null) {
    if (!ciphertext) return null;
    const [version, ivRaw, tagRaw, dataRaw] = ciphertext.split(':');
    if (version !== 'v1' || !ivRaw || !tagRaw || !dataRaw) return null;
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
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
    expectedMode?: AndroidReaderMode;
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
    const reader = readers.find((candidate) => readerMatchesIdentifier(candidate, deviceId));
    if (!reader || reader.status !== DeviceReaderStatus.ACTIVE) {
      throw new ForbiddenException('Reader tidak aktif, dicabut, atau tidak ditemukan.');
    }
    if (reader.revokedAt) {
      throw new ForbiddenException('Reader sudah dicabut.');
    }
    if (args.expectedType && reader.type !== args.expectedType) {
      throw new ForbiddenException('Tipe reader tidak sesuai.');
    }
    if (args.expectedMode && reader.allowedModes?.length && !reader.allowedModes.includes(args.expectedMode)) {
      throw new ForbiddenException('Mode scan tidak diizinkan untuk reader ini.');
    }
    if (args.minSupportedVersionCode && args.appVersionCode && args.appVersionCode < args.minSupportedVersionCode) {
      throw new ForbiddenException('Versi aplikasi reader sudah tidak didukung.');
    }

    const secret = this.decryptSecret(reader.readerSecretCiphertext);
    if (!secret) {
      throw new ForbiddenException('Reader belum memiliki secret signed request.');
    }

    const nonceKey = `schoolhub:reader-nonce:${reader.id}:${sha256Hex(nonce)}`;
    const stored = await this.redis.get(nonceKey);
    if (stored) throw new UnauthorizedException('Nonce reader sudah pernah dipakai.');

    const expectedSignature = hmacHex(secret, this.canonicalSignaturePayload(args.method, args.path, timestamp, nonce, bodyHash));
    if (!safeEqualHex(expectedSignature, signature)) {
      throw new UnauthorizedException('Signature reader tidak valid.');
    }

    await this.redis.setPx(nonceKey, '1', DEFAULT_NONCE_TTL_MS);
    return { reader, timestamp: parsedTimestamp, nonceHash: sha256Hex(nonce), bodyHash };
  }
}
