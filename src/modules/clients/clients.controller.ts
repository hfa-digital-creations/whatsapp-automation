import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole, UserStatus } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { buildCsv, buildVcf } from '../../common/utils/contact-export.util';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { ActivateClientDto } from './dto/activate-client.dto';
import { UpdateClientSettingsDto } from './dto/update-client-settings.dto';
import { RequestPhoneChangeOtpDto, ConfirmPhoneChangeOtpDto } from './dto/phone-change-otp.dto';

@Controller('admin/clients')
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('status') status?: UserStatus,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.clientsService.list({
      search,
      status,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  // Must come before ':id' — otherwise Express matches "export" as an :id value.
  @Get('export')
  @RawResponse()
  async export(
    @Query('format') format: string | undefined,
    @Query('search') search: string | undefined,
    @Query('status') status: UserStatus | undefined,
    @Res() res: Response,
  ) {
    if (format !== 'vcf' && format !== 'csv') {
      throw new BadRequestException('format must be "vcf" or "csv".');
    }
    const contacts = await this.clientsService.exportContacts({ search, status });
    const content = format === 'csv' ? buildCsv(contacts) : buildVcf(contacts);
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="clients-export.${format}"`);
    res.send(content);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.clientsService.getById(id);
  }

  @Post()
  create(@Body() dto: CreateClientDto) {
    return this.clientsService.create(dto);
  }

  @Post(':id/activate')
  activate(@Param('id') id: string, @Body() dto: ActivateClientDto, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    return this.clientsService.activate(id, admin.userId, dto, req.ip);
  }

  @Patch(':id/block')
  block(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    return this.clientsService.block(id, admin.userId, req.ip);
  }

  @Patch(':id/unblock')
  unblock(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    return this.clientsService.unblock(id, admin.userId, req.ip);
  }

  @Patch(':id/delete')
  softDelete(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    return this.clientsService.softDelete(id, admin.userId, req.ip);
  }

  @Patch(':id/restore')
  restore(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    return this.clientsService.restore(id, admin.userId, req.ip);
  }

  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    return this.clientsService.resetPassword(id, admin.userId, req.ip);
  }

  @Patch(':id/login-otp')
  setLoginOtpEnabled(
    @Param('id') id: string,
    @Body('enabled') enabled: boolean,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: any,
  ) {
    return this.clientsService.setLoginOtpEnabled(id, enabled, admin.userId, req.ip);
  }
}

@Controller('client/profile')
@Roles(UserRole.CLIENT)
export class ClientProfileController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.getById(user.clientId!);
  }

  @Patch()
  updateMine(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateClientSettingsDto) {
    return this.clientsService.updateOwnSettings(user.clientId!, dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('phone/request-otp')
  requestPhoneOtp(@CurrentUser() user: AuthenticatedUser, @Body() dto: RequestPhoneChangeOtpDto) {
    return this.clientsService.requestPhoneChangeOtp(user.clientId!, dto.newPhone);
  }

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('phone/confirm-old-otp')
  confirmOldPhoneOtp(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConfirmPhoneChangeOtpDto) {
    return this.clientsService.confirmOldPhoneOtp(user.clientId!, dto.requestId, dto.code);
  }

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('phone/confirm-new-otp')
  confirmNewPhoneOtp(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConfirmPhoneChangeOtpDto) {
    return this.clientsService.confirmNewPhoneOtp(user.clientId!, dto.requestId, dto.code);
  }
}
