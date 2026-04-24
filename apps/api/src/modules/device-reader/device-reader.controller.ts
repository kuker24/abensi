import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateReaderDto, UpdateReaderStatusDto } from './device-reader.dto';
import { DeviceReaderService } from './device-reader.service';

@Controller('devices/readers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN_TU, Role.OPERATOR_IT)
export class DeviceReaderController {
  constructor(private readonly readerService: DeviceReaderService) {}

  @Get()
  listReaders(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pagination = parsePagination({
      page,
      limit,
      defaultLimit: 50,
      maxLimit: 200
    });
    return this.readerService.listReaders(pagination);
  }

  @Post()
  createReader(@Body() body: CreateReaderDto, @CurrentUser() user: { sub: string }) {
    return this.readerService.createReader(body, user.sub);
  }

  @Post(':id/rotate-key')
  rotateKey(@Param('id') id: string, @CurrentUser() user: { sub: string }) {
    return this.readerService.rotateApiKey(id, user.sub);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateReaderStatusDto,
    @CurrentUser() user: { sub: string }
  ) {
    return this.readerService.updateStatus(id, body, user.sub);
  }
}
