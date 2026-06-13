import { Module } from '@nestjs/common';
import { PicketBookController } from './picket-book.controller';
import { PicketBookService } from './picket-book.service';

@Module({
  controllers: [PicketBookController],
  providers: [PicketBookService]
})
export class PicketBookModule {}
