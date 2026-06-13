import { Module } from '@nestjs/common';
import { MobileAndroidAdminController, MobileAndroidPublicController } from './mobile-android.controller';
import { MobileAndroidService } from './mobile-android.service';

@Module({
  controllers: [MobileAndroidPublicController, MobileAndroidAdminController],
  providers: [MobileAndroidService],
  exports: [MobileAndroidService]
})
export class MobileModule {}
