import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { EnquiryStatus, UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EnquiriesService } from './enquiries.service';
import { CreateEnquiryDto } from './dto/create-enquiry.dto';
import { UpdateEnquiryDto } from './dto/update-enquiry.dto';
import { ApproveDraftDto } from '../automation/dto/approve-draft.dto';

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

  /** Corrects contact-detail typos (most commonly a phone number missing its country code). */
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Patch('admin/enquiries/:id')
  async update(@Param('id') id: string, @Body() dto: UpdateEnquiryDto, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    const result = await this.enquiriesService.update(id, dto);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'ENQUIRY_DETAILS_CORRECTED',
      targetType: 'Enquiry',
      targetId: id,
      ipAddress: req.ip,
    });
    return result;
  }

  /**
   * The admin's whole job for converting a lead: pick a plan, click once — see
   * EnquiriesService.approveAndActivate(). `planId` is optional here since it defaults to
   * whichever plan the prospect themselves chose on the landing form.
   */
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post('admin/enquiries/:id/approve-and-activate')
  async approveAndActivate(
    @Param('id') id: string,
    @Body('planId') planId: string | undefined,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: any,
  ) {
    const client = await this.enquiriesService.approveAndActivate(id, planId, admin.userId, req.ip);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'ENQUIRY_APPROVED_AND_ACTIVATED',
      targetType: 'Enquiry',
      targetId: id,
      metadata: { clientId: client.id, planId: planId ?? client.planId },
      ipAddress: req.ip,
    });
    return client;
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Get('admin/enquiries/:id/messages')
  getMessages(@Param('id') id: string) {
    return this.enquiriesService.getMessages(id);
  }

  /** Approves a QUEUED draft reply (enquiryAutomationMode DRAFT_APPROVE) and sends it, optionally edited. */
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post('admin/enquiries/messages/:messageId/approve')
  async approveDraft(
    @Param('messageId') messageId: string,
    @Body() dto: ApproveDraftDto,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: any,
  ) {
    const result = await this.enquiriesService.approveDraft(messageId, admin.userId, dto.editedContent);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'ENQUIRY_DRAFT_APPROVED',
      targetType: 'EnquiryMessage',
      targetId: messageId,
      ipAddress: req.ip,
    });
    return result;
  }

  /** Discards a QUEUED draft reply without sending it. */
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post('admin/enquiries/messages/:messageId/reject')
  async rejectDraft(@Param('messageId') messageId: string, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    const result = await this.enquiriesService.rejectDraft(messageId);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'ENQUIRY_DRAFT_REJECTED',
      targetType: 'EnquiryMessage',
      targetId: messageId,
      ipAddress: req.ip,
    });
    return result;
  }
}
