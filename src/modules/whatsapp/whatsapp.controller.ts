import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { WhatsappAccountsService } from './whatsapp-accounts.service';
import { SimulateMessageDto } from './dto/simulate-message.dto';
import { RequestPairingCodeDto } from './dto/request-pairing-code.dto';
import { AuditLogService } from '../audit-log/audit-log.service';

@Controller('client/whatsapp/accounts')
@Roles(UserRole.CLIENT)
export class WhatsappController {
  constructor(private readonly accountsService: WhatsappAccountsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.accountsService.listForClient(user.clientId!);
  }

  @Get('limit')
  async limit(@CurrentUser() user: AuthenticatedUser) {
    return { limit: await this.accountsService.getEffectiveLimit(user.clientId!) };
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body('displayName') displayName?: string) {
    return this.accountsService.createAccount(user.clientId!, displayName);
  }

  @Get(':id/qr')
  getQr(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.accountsService.getQr(user.clientId!, id);
  }

  @Get(':id/status')
  getStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.accountsService.getStatus(user.clientId!, id);
  }

  @Post(':id/pairing-code')
  requestPairingCode(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RequestPairingCodeDto) {
    return this.accountsService.requestPairingCode(user.clientId!, id, dto.phoneNumber);
  }

  @Post(':id/reconnect')
  reconnect(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.accountsService.reconnect(user.clientId!, id);
  }

  @Post(':id/logout')
  logout(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.accountsService.logout(user.clientId!, id);
  }

  @Delete(':id')
  @UseGuards(FeatureGuard)
  @RequireFeature('WHATSAPP_ACCOUNT_REMOVAL')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.accountsService.removeAccount(user.clientId!, id);
  }
}

@Controller('admin/whatsapp/accounts')
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class AdminWhatsappController {
  constructor(
    private readonly accountsService: WhatsappAccountsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get()
  list(@Query('skip') skip?: string, @Query('take') take?: string) {
    return this.accountsService.listAll({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Post(':id/simulate-message')
  async simulateMessage(
    @Param('id') id: string,
    @Body() dto: SimulateMessageDto,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: any,
  ) {
    const result = await this.accountsService.simulateInboundMessage(id, dto);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'WHATSAPP_MESSAGE_SIMULATED',
      targetType: 'WhatsappAccount',
      targetId: id,
      metadata: { fromPhone: dto.fromPhone },
      ipAddress: req.ip,
    });
    return result;
  }

  @Post(':id/logout')
  async logout(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    const result = await this.accountsService.adminLogout(id);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'WHATSAPP_ACCOUNT_LOGOUT_BY_ADMIN',
      targetType: 'WhatsappAccount',
      targetId: id,
      ipAddress: req.ip,
    });
    return result;
  }

  @Post(':id/reconnect')
  async reconnect(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    const result = await this.accountsService.adminReconnect(id);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'WHATSAPP_ACCOUNT_RECONNECT_BY_ADMIN',
      targetType: 'WhatsappAccount',
      targetId: id,
      ipAddress: req.ip,
    });
    return result;
  }
}
