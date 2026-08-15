import { BadRequestException, Body, Controller, Get, Param, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { OffersService } from './offers.service';
import { OfferSendJobData } from './offer-send.processor';
import { CreateOfferDto } from './dto/create-offer.dto';
import { SendOfferDto } from './dto/send-offer.dto';
import { GenerateOfferTextDto } from './dto/generate-offer-text.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { MAX_OFFER_MEDIA_BYTES } from './offer-media.util';

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
    return this.offersService.create(dto.name, dto.message, {
      mediaUrl: dto.mediaUrl,
      mediaType: dto.mediaType,
      mediaFileName: dto.mediaFileName,
    });
  }

  /** Uploads an image/video/PDF to attach to an offer campaign's broadcast message. */
  @Post('media')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_OFFER_MEDIA_BYTES } }))
  uploadMedia(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded.');
    return this.offersService.saveMedia(file);
  }

  /** Drafts broadcast copy from a short admin prompt via the AI provider — a starting point, not a final send. */
  @Post('generate-message')
  async generateMessage(@Body() dto: GenerateOfferTextDto) {
    const message = await this.offersService.generateText(dto.prompt);
    return { message };
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
    if (dto.target === 'SPECIFIC_CLIENTS' && !dto.clientIds?.length) {
      throw new BadRequestException('Select at least one client to send this offer to.');
    }

    const { message } = await this.offersService.prepareSend(id, dto.messageOverride);
    await this.offersQueue.add(
      'send-offer',
      { campaignId: id, target: dto.target, message, clientIds: dto.clientIds },
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
      metadata: { target: dto.target, clientCount: dto.clientIds?.length },
      ipAddress: req.ip,
    });
    return { queued: true };
  }
}
