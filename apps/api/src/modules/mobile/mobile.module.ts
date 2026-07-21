import { Module } from '@nestjs/common';
import { AndroidApkReleaseAdminController, MobileAndroidAdminController, MobileAndroidPublicController } from './mobile-android.controller';
import { AndroidApkValidatorService, ANDROID_APK_TOOL_RUNNER, ExecFileAndroidApkToolRunner } from './android-apk-validator.service';
import { MobileAndroidService } from './mobile-android.service';

@Module({
  controllers: [MobileAndroidPublicController, MobileAndroidAdminController, AndroidApkReleaseAdminController],
  providers: [
    MobileAndroidService,
    AndroidApkValidatorService,
    { provide: ANDROID_APK_TOOL_RUNNER, useClass: ExecFileAndroidApkToolRunner }
  ],
  exports: [MobileAndroidService]
})
export class MobileModule {}
