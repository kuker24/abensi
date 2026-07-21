import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { AndroidApkVerificationStatus } from '@prisma/client';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const ANDROID_APK_PACKAGE_NAME = 'id.sch.man1rokanhulu.absensi';
export const DEFAULT_ANDROID_APK_SIGNER_SHA256 = 'd59641008136073660c01f7b57957895d21ca4f310bcf7a4329c05173a3581eb';
export const DEFAULT_ANDROID_APK_REQUIRED_TARGET_SDK = 35;
const DEFAULT_ANDROID_BUILD_TOOLS_DIR = '/opt/android-sdk/build-tools/35.0.0';
const TOOL_TIMEOUT_MS = 10_000;
const TOOL_MAX_OUTPUT_BYTES = 64 * 1024;

export type AndroidApkToolName = 'aapt-badging' | 'aapt-manifest' | 'apksigner';
export const ANDROID_APK_TOOL_RUNNER = Symbol('ANDROID_APK_TOOL_RUNNER');

export interface AndroidApkToolRunner {
  run(tool: AndroidApkToolName, executable: string, args: readonly string[]): Promise<string>;
}

@Injectable()
export class ExecFileAndroidApkToolRunner implements AndroidApkToolRunner {
  async run(_tool: AndroidApkToolName, executable: string, args: readonly string[]) {
    try {
      const result = await execFileAsync(executable, [...args], {
        encoding: 'utf8',
        timeout: TOOL_TIMEOUT_MS,
        maxBuffer: TOOL_MAX_OUTPUT_BYTES,
        windowsHide: true
      });
      return result.stdout;
    } catch {
      throw new AndroidApkValidationError('ANDROID_APK_TOOL_FAILED');
    }
  }
}

export interface AndroidApkVerificationInput {
  versionName: string;
  versionCode: number;
}

export interface AndroidApkAttestation {
  packageName: string;
  apkVersionName: string;
  apkVersionCode: number;
  targetSdkVersion: number;
  isDebuggable: false;
  usesCleartextTraffic: false;
  signatureSchemeV2: true;
  signerSha256: string;
  verificationStatus: AndroidApkVerificationStatus;
  verifiedAt: Date;
}

export class AndroidApkValidationError extends BadRequestException {
  constructor(readonly reasonCode: string) {
    super('APK tidak lolos verifikasi keamanan.');
  }
}

function readToolPath(name: 'aapt' | 'apksigner') {
  const configured = process.env[name === 'aapt' ? 'ANDROID_AAPT_PATH' : 'ANDROID_APKSIGNER_PATH'];
  const fallback = path.join(DEFAULT_ANDROID_BUILD_TOOLS_DIR, name);
  const value = String(configured || fallback).trim();
  if (!value || !path.isAbsolute(value)) throw new Error(`Path ${name} Android tidak valid.`);
  return value;
}

export function parseAllowedSignerSha256(value = process.env.ANDROID_APK_ALLOWED_SIGNER_SHA256 || DEFAULT_ANDROID_APK_SIGNER_SHA256) {
  const values = String(value)
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (!values.length || values.some((entry) => !/^[a-f0-9]{64}$/.test(entry))) {
    throw new Error('ANDROID_APK_ALLOWED_SIGNER_SHA256 tidak valid.');
  }
  return new Set(values);
}

function parseBadgingPositiveInteger(output: string, key: 'targetSdkVersion') {
  const rawValue = new RegExp(`^\\s*${key}:'(\\d+)'\\s*$`, 'm').exec(String(output))?.[1];
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < 1) throw new AndroidApkValidationError('ANDROID_APK_BADGING_MALFORMED');
  return value;
}

export function parseAaptBadging(output: string) {
  const packageLine = String(output)
    .split(/\r?\n/)
    .find((line) => line.startsWith('package:'));
  if (!packageLine) throw new AndroidApkValidationError('ANDROID_APK_BADGING_MALFORMED');
  const packageName = /\bname='([^']+)'/.exec(packageLine)?.[1];
  const versionName = /\bversionName='([^']+)'/.exec(packageLine)?.[1];
  const versionCodeRaw = /\bversionCode='(\d+)'/.exec(packageLine)?.[1];
  const versionCode = Number(versionCodeRaw);
  const targetSdkVersion = parseBadgingPositiveInteger(output, 'targetSdkVersion');
  if (!packageName || !versionName || !Number.isSafeInteger(versionCode) || versionCode < 1) {
    throw new AndroidApkValidationError('ANDROID_APK_BADGING_MALFORMED');
  }
  return { packageName, versionName, versionCode, targetSdkVersion };
}

export function parseRequiredTargetSdkVersion(value = process.env.ANDROID_APK_REQUIRED_TARGET_SDK || String(DEFAULT_ANDROID_APK_REQUIRED_TARGET_SDK)) {
  const rawValue = String(value).trim();
  if (!/^\d+$/.test(rawValue)) throw new Error('ANDROID_APK_REQUIRED_TARGET_SDK tidak valid.');
  const targetSdkVersion = Number(rawValue);
  if (!Number.isSafeInteger(targetSdkVersion) || targetSdkVersion < DEFAULT_ANDROID_APK_REQUIRED_TARGET_SDK) {
    throw new Error('ANDROID_APK_REQUIRED_TARGET_SDK tidak valid.');
  }
  return targetSdkVersion;
}

function parseManifestBoolean(output: string, attribute: 'debuggable' | 'usesCleartextTraffic') {
  const line = String(output)
    .split(/\r?\n/)
    .find((entry) => entry.includes(`android:${attribute}`));
  if (!line) return undefined;
  const rawValue = /\(type\s+0x12\)\s*(0x[0-9a-f]+|true|false)\b/i.exec(line)?.[1]?.toLowerCase();
  if (!rawValue) throw new AndroidApkValidationError('ANDROID_APK_MANIFEST_MALFORMED');
  if (rawValue === 'true' || /^0xf+$/.test(rawValue)) return true;
  if (rawValue === 'false' || /^0x0+$/.test(rawValue)) return false;
  throw new AndroidApkValidationError('ANDROID_APK_MANIFEST_MALFORMED');
}

export function parseAaptManifest(output: string) {
  if (!/\bE:\s+manifest\b/.test(String(output)) || !/\bE:\s+application\b/.test(String(output))) {
    throw new AndroidApkValidationError('ANDROID_APK_MANIFEST_MALFORMED');
  }
  return {
    isDebuggable: parseManifestBoolean(output, 'debuggable') ?? false,
    usesCleartextTraffic: parseManifestBoolean(output, 'usesCleartextTraffic')
  };
}

export function parseApksignerVerify(output: string) {
  const lines = String(output).split(/\r?\n/);
  const v2 = lines.find((line) => /Verified using v2 scheme/i.test(line));
  if (!v2 || !/:\s*true\s*$/i.test(v2)) throw new AndroidApkValidationError('ANDROID_APK_V2_SIGNATURE_REQUIRED');

  const signers = lines
    .map((line) => /Signer\s+#\d+\s+certificate\s+SHA-256\s+digest:\s*([a-f0-9:]{64,})\s*$/i.exec(line)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replaceAll(':', '').toLowerCase());
  if (signers.length !== 1 || !/^[a-f0-9]{64}$/.test(signers[0])) {
    throw new AndroidApkValidationError('ANDROID_APK_SIGNER_MALFORMED');
  }
  return { signatureSchemeV2: true as const, signerSha256: signers[0] };
}

@Injectable()
export class AndroidApkValidatorService {
  private readonly aaptPath = readToolPath('aapt');
  private readonly apksignerPath = readToolPath('apksigner');
  private readonly allowedSigners = parseAllowedSignerSha256();
  private readonly requiredTargetSdkVersion = parseRequiredTargetSdkVersion();

  constructor(@Inject(ANDROID_APK_TOOL_RUNNER) private readonly runner: AndroidApkToolRunner) {}

  async verify(apkPath: string, expected: AndroidApkVerificationInput): Promise<AndroidApkAttestation> {
    if (!path.isAbsolute(apkPath) || !Number.isSafeInteger(expected.versionCode) || expected.versionCode < 1 || !String(expected.versionName || '').trim()) {
      throw new AndroidApkValidationError('ANDROID_APK_EXPECTED_METADATA_INVALID');
    }

    const [badgingOutput, manifestOutput, signerOutput] = await Promise.all([
      this.runTool('aapt-badging', this.aaptPath, ['dump', 'badging', apkPath]),
      this.runTool('aapt-manifest', this.aaptPath, ['dump', 'xmltree', apkPath, 'AndroidManifest.xml']),
      this.runTool('apksigner', this.apksignerPath, ['verify', '--verbose', '--print-certs', apkPath])
    ]);

    const badging = parseAaptBadging(badgingOutput);
    const manifest = parseAaptManifest(manifestOutput);
    const signature = parseApksignerVerify(signerOutput);

    if (badging.packageName !== ANDROID_APK_PACKAGE_NAME) throw new AndroidApkValidationError('ANDROID_APK_PACKAGE_MISMATCH');
    if (badging.versionName !== expected.versionName || badging.versionCode !== expected.versionCode) {
      throw new AndroidApkValidationError('ANDROID_APK_VERSION_MISMATCH');
    }
    if (badging.targetSdkVersion !== this.requiredTargetSdkVersion) throw new AndroidApkValidationError('ANDROID_APK_TARGET_SDK_MISMATCH');
    if (manifest.isDebuggable) throw new AndroidApkValidationError('ANDROID_APK_DEBUGGABLE');
    if (manifest.usesCleartextTraffic === undefined) throw new AndroidApkValidationError('ANDROID_APK_CLEARTEXT_POLICY_REQUIRED');
    if (manifest.usesCleartextTraffic) throw new AndroidApkValidationError('ANDROID_APK_CLEARTEXT');
    if (!this.allowedSigners.has(signature.signerSha256)) throw new AndroidApkValidationError('ANDROID_APK_SIGNER_NOT_ALLOWED');

    return {
      packageName: badging.packageName,
      apkVersionName: badging.versionName,
      apkVersionCode: badging.versionCode,
      targetSdkVersion: badging.targetSdkVersion,
      isDebuggable: false,
      usesCleartextTraffic: false,
      signatureSchemeV2: true,
      signerSha256: signature.signerSha256,
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date()
    };
  }

  private async runTool(tool: AndroidApkToolName, executable: string, args: readonly string[]) {
    try {
      return await this.runner.run(tool, executable, args);
    } catch (error) {
      if (error instanceof AndroidApkValidationError) throw error;
      throw new AndroidApkValidationError('ANDROID_APK_TOOL_FAILED');
    }
  }
}
