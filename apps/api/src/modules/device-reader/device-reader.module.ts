import { Module } from '@nestjs/common';
import { DeviceReaderAdminController, DeviceReaderAndroidStatusController, DeviceReaderController, DeviceReaderProvisionController } from './device-reader.controller';
import { DeviceReaderService } from './device-reader.service';

@Module({
  controllers: [DeviceReaderController, DeviceReaderAdminController, DeviceReaderProvisionController, DeviceReaderAndroidStatusController],
  providers: [DeviceReaderService]
})
export class DeviceReaderModule {}
