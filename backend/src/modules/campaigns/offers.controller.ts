import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { OffersService } from './offers.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { SendOfferDto } from './dto/send-offer.dto';
import { AuditLogService } from '../audit-log/audit-log.service';

@Controller('admin/offers')
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class OffersController {
  constructor(
    private readonly offersService: OffersService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get()
  list() {
    return this.offersService.list();
  }

  @Get(':id/messages')
  getMessages(@Param('id') id: string) {
    return this.offersService.getMessages(id);
  }

  @Post()
  create(@Body() dto: CreateOfferDto) {
    return this.offersService.create(dto.name, dto.message);
  }

  @Post(':id/send')
  async send(
    @Param('id') id: string,
    @Body() dto: SendOfferDto,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: any,
  ) {
    const result = await this.offersService.send(id, dto.target, dto.messageOverride);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'OFFER_CAMPAIGN_SENT',
      targetType: 'Campaign',
      targetId: id,
      metadata: { target: dto.target, ...result },
      ipAddress: req.ip,
    });
    return result;
  }
}
