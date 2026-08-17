import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { UserRole, WhatsappAccountStatus } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/services/prisma.service';
import { OffersService } from './offers.service';
import { OfferGroupsService } from './offer-groups.service';
import { OfferSendJobData } from './offer-send.processor';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { GenerateOfferTextDto } from './dto/generate-offer-text.dto';
import { SendClientOfferDto, SendFollowupDto } from './dto/client-offer.dto';
import { MAX_OFFER_MEDIA_BYTES } from './offer-media.util';

/** A client's own promotional broadcasts to their own customers, sent via their own connected
 * WhatsApp account — mirrors OffersController but scoped to the caller's own clientId throughout. */
@Controller('client/offers')
@Roles(UserRole.CLIENT)
@UseGuards(FeatureGuard)
@RequireFeature('OFFER_MESSAGES')
export class ClientOffersController {
  constructor(
    private readonly offersService: OffersService,
    private readonly offerGroupsService: OfferGroupsService,
    private readonly prisma: PrismaService,
    @InjectQueue('offers') private readonly offersQueue: Queue<OfferSendJobData>,
  ) {}

  /** A connected WhatsApp account this client owns is the only valid send-from session — never trust a client-supplied sessionId without checking ownership + status. */
  private async requireConnectedAccount(clientId: string, sessionId: string) {
    const account = await this.prisma.whatsappAccount.findFirst({ where: { sessionId, clientId } });
    if (!account) throw new BadRequestException('That WhatsApp account was not found on your account.');
    if (account.status !== WhatsappAccountStatus.CONNECTED) {
      throw new BadRequestException('That WhatsApp account is not currently connected.');
    }
    return account;
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.offersService.list(user.clientId!);
  }

  @Get('trash')
  listTrash(@CurrentUser() user: AuthenticatedUser) {
    return this.offersService.listTrash(user.clientId!);
  }

  @Get(':id/messages')
  getMessages(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.offersService.getMessages(id, user.clientId!);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOfferDto) {
    return this.offersService.create(
      dto.name,
      dto.message,
      { mediaUrl: dto.mediaUrl, mediaType: dto.mediaType, mediaFileName: dto.mediaFileName },
      user.clientId!,
    );
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateOfferDto) {
    return this.offersService.update(id, dto, user.clientId!);
  }

  @Post('media')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_OFFER_MEDIA_BYTES } }))
  uploadMedia(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded.');
    return this.offersService.saveMedia(file);
  }

  @Post('generate-message')
  async generateMessage(@Body() dto: GenerateOfferTextDto) {
    const message = await this.offersService.generateText(dto.prompt, 'customers');
    return { message };
  }

  /** Sends a one-off AI-draftable follow-up message to a single contact via the client's own connected account. */
  @Post('followup')
  async sendFollowup(@CurrentUser() user: AuthenticatedUser, @Body() dto: SendFollowupDto) {
    if (!dto.sessionId) throw new BadRequestException('Select which connected WhatsApp account to send from.');
    await this.requireConnectedAccount(user.clientId!, dto.sessionId);
    return this.offersService.sendFollowup(dto.phone, dto.message, dto.sessionId);
  }

  @Post(':id/send')
  async send(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SendClientOfferDto) {
    await this.requireConnectedAccount(user.clientId!, dto.sessionId);

    let phoneNumbers = dto.phoneNumbers;
    if (dto.target === 'PHONE_NUMBERS') {
      phoneNumbers = (dto.phoneNumbers ?? [])
        .map((r) => ({ phone: r.phone?.trim(), name: r.name?.trim() }))
        .filter((r): r is { phone: string; name: string | undefined } => !!r.phone);
      if (!phoneNumbers.length) throw new BadRequestException('Add at least one phone number to send this offer to.');
    }
    if (dto.target === 'GROUP') {
      if (!dto.groupId) throw new BadRequestException('Select a group to send this offer to.');
      const group = await this.offerGroupsService.getById(dto.groupId, user.clientId!);
      if (!group.members.length) throw new BadRequestException('This group has no members yet.');
    }

    const { message } = await this.offersService.prepareSend(id, user.clientId!, dto.messageOverride);
    await this.offersQueue.add(
      'send-offer',
      { campaignId: id, target: dto.target, message, phoneNumbers, groupId: dto.groupId, sessionId: dto.sessionId },
      {
        jobId: `offer-send-${id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    return { queued: true };
  }

  @Delete(':id')
  moveToTrash(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.offersService.moveToTrash(id, user.clientId!);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.offersService.restore(id, user.clientId!);
  }

  @Delete(':id/permanent')
  permanentlyDelete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.offersService.permanentlyDelete(id, user.clientId!);
  }
}
