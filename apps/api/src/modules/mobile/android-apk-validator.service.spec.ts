import { AndroidApkValidatorService, AndroidApkValidationError, type AndroidApkToolRunner, DEFAULT_ANDROID_APK_SIGNER_SHA256, parseAaptBadging, parseAaptManifest, parseAllowedSignerSha256, parseApksignerVerify, parseRequiredTargetSdkVersion } from './android-apk-validator.service';

const validBadging = [
  "package: name='id.sch.man1rokanhulu.absensi' versionCode='9' versionName='1.2.5' platformBuildVersionName='15'",
  "targetSdkVersion:'35'"
].join('\n');
// Sanitized excerpts retain Android Build-Tools 35 formatting without certificate subject data.
const validManifest = [
  'E: manifest (line=2)',
  '  E: application (line=7)',
  '    A: android:label(0x01010001)=@0x7f0f001c',
  '    A: android:debuggable(0x0101000f)=(type 0x12)0x0',
  '    A: android:usesCleartextTraffic(0x01010000)=(type 0x12)0x0'
].join('\n');
const validSigner = [
  'Verifies',
  'Verified using v1 scheme (JAR signing): true',
  'Verified using v2 scheme (APK Signature Scheme v2): true',
  'Verified using v3 scheme (APK Signature Scheme v3): true',
  `Signer #1 certificate SHA-256 digest: ${DEFAULT_ANDROID_APK_SIGNER_SHA256.match(/.{1,2}/g)?.join(':')}`
].join('\n');
// Sanitized output shape captured from production APK 1.2.4 code 8 using official Android Build-Tools.
const productionLikeBadging = [
  "package: name='id.sch.man1rokanhulu.absensi' versionCode='8' versionName='1.2.4' platformBuildVersionName='15'",
  "targetSdkVersion:'35'"
].join('\n');
const debugManifest = validManifest.replace('android:debuggable(0x0101000f)=(type 0x12)0x0', 'android:debuggable(0x0101000f)=(type 0x12)0xffffffff');

function runner(overrides: Partial<Record<'aapt-badging' | 'aapt-manifest' | 'apksigner', string | Error>> = {}): AndroidApkToolRunner {
  return {
    run: jest.fn(async (tool) => {
      const value = overrides[tool] ?? (tool === 'aapt-badging' ? validBadging : tool === 'aapt-manifest' ? validManifest : validSigner);
      if (value instanceof Error) throw value;
      return value;
    })
  };
}

describe('Android APK attestation parser', () => {
  it('parses valid official Android tool output', () => {
    expect(parseAaptBadging(validBadging)).toEqual({ packageName: 'id.sch.man1rokanhulu.absensi', versionName: '1.2.5', versionCode: 9, targetSdkVersion: 35 });
    expect(parseAaptManifest(validManifest)).toEqual({ isDebuggable: false, usesCleartextTraffic: false });
    expect(parseApksignerVerify(validSigner)).toEqual({ signatureSchemeV2: true, signerSha256: DEFAULT_ANDROID_APK_SIGNER_SHA256 });
  });

  it('parses sanitized production code-8 metadata shape', () => {
    expect(parseAaptBadging(productionLikeBadging)).toEqual({ packageName: 'id.sch.man1rokanhulu.absensi', versionName: '1.2.4', versionCode: 8, targetSdkVersion: 35 });
  });

  it('distinguishes absent cleartext policy from explicit false', () => {
    expect(parseAaptManifest('E: manifest\n  E: application\n    A: android:debuggable(0x0101000f)=(type 0x12)0x0')).toEqual({ isDebuggable: false, usesCleartextTraffic: undefined });
  });

  it.each([
    ['missing target SDK', validBadging.replace("\ntargetSdkVersion:'35'", '')],
    ['malformed target SDK', validBadging.replace("targetSdkVersion:'35'", "targetSdkVersion:'abc'")],
    ['unsafe target SDK', validBadging.replace("targetSdkVersion:'35'", "targetSdkVersion:'9007199254740992'")]
  ])('rejects %s in APK badging', (_name, output) => {
    expect(() => parseAaptBadging(output)).toThrow(expect.objectContaining({ reasonCode: 'ANDROID_APK_BADGING_MALFORMED' }));
  });

  it('rejects invalid required target SDK configuration', () => {
    expect(() => parseRequiredTargetSdkVersion('34')).toThrow('ANDROID_APK_REQUIRED_TARGET_SDK tidak valid.');
    expect(() => parseRequiredTargetSdkVersion('35.0')).toThrow('ANDROID_APK_REQUIRED_TARGET_SDK tidak valid.');
  });

  it.each([
    ['badging', () => parseAaptBadging('package: name='), 'ANDROID_APK_BADGING_MALFORMED'],
    ['manifest', () => parseAaptManifest('not a manifest'), 'ANDROID_APK_MANIFEST_MALFORMED'],
    ['missing V2', () => parseApksignerVerify('Verified using v2 scheme (APK Signature Scheme v2): false'), 'ANDROID_APK_V2_SIGNATURE_REQUIRED'],
    ['malformed signer', () => parseApksignerVerify('Verified using v2 scheme (APK Signature Scheme v2): true'), 'ANDROID_APK_SIGNER_MALFORMED']
  ])('rejects %s output', (_name, execute, code) => {
    expect(execute).toThrow(expect.objectContaining({ reasonCode: code }));
  });

  it('rejects invalid signer configuration', () => {
    expect(() => parseAllowedSignerSha256('not-a-fingerprint')).toThrow('ANDROID_APK_ALLOWED_SIGNER_SHA256 tidak valid.');
  });
});

describe('AndroidApkValidatorService', () => {
  const expected = { versionName: '1.2.5', versionCode: 9 };

  it('attests valid official output without exposing tool values', async () => {
    const service = new AndroidApkValidatorService(runner());
    await expect(service.verify('/tmp/reader.apk', expected)).resolves.toMatchObject({
      packageName: 'id.sch.man1rokanhulu.absensi',
      apkVersionName: '1.2.5',
      apkVersionCode: 9,
      targetSdkVersion: 35,
      isDebuggable: false,
      usesCleartextTraffic: false,
      signatureSchemeV2: true,
      signerSha256: DEFAULT_ANDROID_APK_SIGNER_SHA256,
      verificationStatus: 'VERIFIED'
    });
  });

  it('accepts official-tool production code-8 output with target SDK 35 and explicit cleartext denial', async () => {
    const service = new AndroidApkValidatorService(runner({ 'aapt-badging': productionLikeBadging }));
    await expect(service.verify('/tmp/reader.apk', { versionName: '1.2.4', versionCode: 8 })).resolves.toMatchObject({
      apkVersionCode: 8,
      targetSdkVersion: 35,
      verificationStatus: 'VERIFIED'
    });
  });

  it.each([
    ['debuggable', runner({ 'aapt-manifest': debugManifest }), 'ANDROID_APK_DEBUGGABLE'],
    ['missing cleartext policy', runner({ 'aapt-manifest': validManifest.replace(/\n\s*A: android:usesCleartextTraffic[^\n]*/, '') }), 'ANDROID_APK_CLEARTEXT_POLICY_REQUIRED'],
    ['cleartext', runner({ 'aapt-manifest': validManifest.replace('android:usesCleartextTraffic(0x01010000)=(type 0x12)0x0', 'android:usesCleartextTraffic(0x01010000)=(type 0x12)0xffffffff') }), 'ANDROID_APK_CLEARTEXT'],
    ['target SDK below policy', runner({ 'aapt-badging': validBadging.replace("targetSdkVersion:'35'", "targetSdkVersion:'34'") }), 'ANDROID_APK_TARGET_SDK_MISMATCH'],
    ['package mismatch', runner({ 'aapt-badging': validBadging.replace('id.sch.man1rokanhulu.absensi', 'com.example.wrong') }), 'ANDROID_APK_PACKAGE_MISMATCH'],
    ['version mismatch', runner({ 'aapt-badging': validBadging.replace("versionCode='9'", "versionCode='10'") }), 'ANDROID_APK_VERSION_MISMATCH'],
    ['wrong signer', runner({ apksigner: validSigner.replace(DEFAULT_ANDROID_APK_SIGNER_SHA256.match(/.{1,2}/g)?.join(':') || '', 'aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa:aa') }), 'ANDROID_APK_SIGNER_NOT_ALLOWED'],
    ['tool failure', runner({ apksigner: new Error('tool failed') }), 'ANDROID_APK_TOOL_FAILED']
  ])('rejects %s', async (_name, toolRunner, code) => {
    const service = new AndroidApkValidatorService(toolRunner);
    await expect(service.verify('/tmp/reader.apk', expected)).rejects.toEqual(expect.objectContaining({ reasonCode: code }));
  });

  it('fails unsafe input before running tools', async () => {
    const toolRunner = runner();
    const service = new AndroidApkValidatorService(toolRunner);
    await expect(service.verify('relative.apk', expected)).rejects.toBeInstanceOf(AndroidApkValidationError);
    expect(toolRunner.run).not.toHaveBeenCalled();
  });
});
