import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { EnquiryStatus, UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EnquiriesService } from './enquiries.service';
import { CreateEnquiryDto } from './dto/create-enquiry.dto';

@Controller()
export class EnquiriesController {
  constructor(
    private readonly enquiriesService: EnquiriesService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('public/enquiries')
  create(@Body() dto: CreateEnquiryDto) {
    return this.enquiriesService.create(dto);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Get('admin/enquiries')
  list(@Query('status') status?: EnquiryStatus, @Query('skip') skip?: string, @Query('take') take?: string) {
    return this.enquiriesService.list({
      status,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Patch('admin/enquiries/:id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: EnquiryStatus) {
    return this.enquiriesService.updateStatus(id, status);
  }

  /** The admin's whole job for converting a lead: pick a plan, click once — see EnquiriesService.approveAndActivate(). */
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post('admin/enquiries/:id/approve-and-activate')
  async approveAndActivate(
    @Param('id') id: string,
    @Body('planId') planId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: any,
  ) {
    if (!planId) throw new BadRequestException('Select a plan to activate.');
    const client = await this.enquiriesService.approveAndActivate(id, planId, admin.userId, req.ip);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'ENQUIRY_APPROVED_AND_ACTIVATED',
      targetType: 'Enquiry',
      targetId: id,
      metadata: { clientId: client.id, planId },
      ipAddress: req.ip,
    });
    return client;
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Get('admin/enquiries/:id/messages')
  getMessages(@Param('id') id: string) {
    return this.enquiriesService.getMessages(id);
  }
}
