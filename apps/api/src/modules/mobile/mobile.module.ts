import { Module } from '@nestjs/common';
import { AndroidApkReleaseAdminController, MobileAndroidAdminController, MobileAndroidPublicController } from './mobile-android.controller';
import { MobileAndroidService } from './mobile-android.service';

@Module({
  controllers: [MobileAndroidPublicController, MobileAndroidAdminController, AndroidApkReleaseAdminController],
  providers: [MobileAndroidService],
  exports: [MobileAndroidService]
})
export class MobileModule {}
