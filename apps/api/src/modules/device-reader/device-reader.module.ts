import { Module } from '@nestjs/common';
import { DeviceReaderAdminController, DeviceReaderController, DeviceReaderProvisionController } from './device-reader.controller';
import { DeviceReaderService } from './device-reader.service';

@Module({
  controllers: [DeviceReaderController, DeviceReaderAdminController, DeviceReaderProvisionController],
  providers: [DeviceReaderService]
})
export class DeviceReaderModule {}
