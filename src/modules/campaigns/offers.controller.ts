import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { OffersService } from './offers.service';
import { OfferSendJobData } from './offer-send.processor';
import { CreateOfferDto } from './dto/create-offer.dto';
import { SendOfferDto } from './dto/send-offer.dto';
import { AuditLogService } from '../audit-log/audit-log.service';

@Controller('admin/offers')
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class OffersController {
  constructor(
    private readonly offersService: OffersService,
    private readonly auditLogService: AuditLogService,
    @InjectQueue('offers') private readonly offersQueue: Queue<OfferSendJobData>,
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

  /**
   * Validates and flips the campaign to RUNNING synchronously (so a bad request fails
   * immediately), then hands the actual sending off to the 'offers' background queue —
   * a real send can take many minutes once batching/pauses are factored in, far beyond
   * any sane HTTP timeout. Progress is visible via GET :id/messages while it runs.
   */
  @Post(':id/send')
  async send(
    @Param('id') id: string,
    @Body() dto: SendOfferDto,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: any,
  ) {
    const { message } = await this.offersService.prepareSend(id, dto.messageOverride);
    await this.offersQueue.add(
      'send-offer',
      { campaignId: id, target: dto.target, message },
      {
        jobId: `offer-send-${id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'OFFER_CAMPAIGN_QUEUED',
      targetType: 'Campaign',
      targetId: id,
      metadata: { target: dto.target },
      ipAddress: req.ip,
    });
    return { queued: true };
  }
}
