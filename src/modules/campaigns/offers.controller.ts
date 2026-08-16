import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { OffersService } from './offers.service';
import { OfferSendJobData } from './offer-send.processor';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
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

  @Get('trash')
  listTrash() {
    return this.offersService.listTrash();
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

  /** Only DRAFT campaigns can be edited — see OffersService.update() for why. */
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateOfferDto, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    const result = await this.offersService.update(id, dto);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'OFFER_CAMPAIGN_UPDATED',
      targetType: 'Campaign',
      targetId: id,
      ipAddress: req.ip,
    });
    return result;
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
    let phoneNumbers = dto.phoneNumbers;
    if (dto.target === 'PHONE_NUMBERS') {
      phoneNumbers = (dto.phoneNumbers ?? [])
        .map((r) => ({ phone: r.phone?.trim(), name: r.name?.trim() }))
        .filter((r): r is { phone: string; name: string | undefined } => !!r.phone);
      if (!phoneNumbers.length) {
        throw new BadRequestException('Add at least one phone number to send this offer to.');
      }
    }

    const { message } = await this.offersService.prepareSend(id, dto.messageOverride);
    await this.offersQueue.add(
      'send-offer',
      { campaignId: id, target: dto.target, message, clientIds: dto.clientIds, phoneNumbers },
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
      metadata: { target: dto.target, clientCount: dto.clientIds?.length, phoneCount: phoneNumbers?.length },
      ipAddress: req.ip,
    });
    return { queued: true };
  }

  /** Moves the campaign to trash — blocked while RUNNING. Restorable until permanently deleted. */
  @Delete(':id')
  async moveToTrash(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    const result = await this.offersService.moveToTrash(id);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'OFFER_CAMPAIGN_TRASHED',
      targetType: 'Campaign',
      targetId: id,
      ipAddress: req.ip,
    });
    return result;
  }

  @Post(':id/restore')
  async restore(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    const result = await this.offersService.restore(id);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'OFFER_CAMPAIGN_RESTORED',
      targetType: 'Campaign',
      targetId: id,
      ipAddress: req.ip,
    });
    return result;
  }

  @Delete(':id/permanent')
  async permanentlyDelete(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser, @Req() req: any) {
    const result = await this.offersService.permanentlyDelete(id);
    await this.auditLogService.record({
      adminId: admin.userId,
      action: 'OFFER_CAMPAIGN_PERMANENTLY_DELETED',
      targetType: 'Campaign',
      targetId: id,
      ipAddress: req.ip,
    });
    return result;
  }
}
