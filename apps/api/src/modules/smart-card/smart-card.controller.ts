import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateSmartCardDto, UpdateSmartCardDto } from './smart-card.dto';
import { SmartCardService } from './smart-card.service';

@Controller('devices/cards')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.DEVELOPER)
export class SmartCardController {
  constructor(private readonly smartCardService: SmartCardService) {}

  @Get()
  listCards(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pagination = parsePagination({
      page,
      limit,
      defaultLimit: 50,
      maxLimit: 200
    });
    return this.smartCardService.listCards(pagination);
  }

  @Post()
  createCard(@Body() body: CreateSmartCardDto, @CurrentUser() user: { sub: string }) {
    return this.smartCardService.createCard(body, user.sub);
  }

  @Patch(':id')
  updateCard(
    @Param('id') cardId: string,
    @Body() body: UpdateSmartCardDto,
    @CurrentUser() user: { sub: string }
  ) {
    return this.smartCardService.updateCard(cardId, body, user.sub);
  }
}
