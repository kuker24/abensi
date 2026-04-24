import { Module } from '@nestjs/common';
import { DeviceReaderController } from './device-reader.controller';
import { DeviceReaderService } from './device-reader.service';

@Module({
  controllers: [DeviceReaderController],
  providers: [DeviceReaderService]
})
export class DeviceReaderModule {}
