import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ConversationsService } from './conversations.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ApproveDraftDto } from './dto/approve-draft.dto';
import { BulkIdsDto } from './dto/bulk-ids.dto';

@Controller('client/conversations')
@Roles(UserRole.CLIENT)
@UseGuards(FeatureGuard)
@RequireFeature('WHATSAPP_AUTOMATION')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.conversationsService.listForClient(user.clientId!);
  }

  @Get('trash')
  listTrash(@CurrentUser() user: AuthenticatedUser) {
    return this.conversationsService.listTrash(user.clientId!);
  }

  @Delete(':id')
  softDelete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.conversationsService.softDelete(user.clientId!, id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.conversationsService.restore(user.clientId!, id);
  }

  @Delete(':id/permanent')
  permanentlyDelete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.conversationsService.permanentlyDelete(user.clientId!, id);
  }

  @Post('bulk-delete')
  bulkSoftDelete(@CurrentUser() user: AuthenticatedUser, @Body() dto: BulkIdsDto) {
    return this.conversationsService.bulkSoftDelete(user.clientId!, dto.ids);
  }

  @Post('bulk-restore')
  bulkRestore(@CurrentUser() user: AuthenticatedUser, @Body() dto: BulkIdsDto) {
    return this.conversationsService.bulkRestore(user.clientId!, dto.ids);
  }

  @Post('bulk-permanent-delete')
  bulkPermanentlyDelete(@CurrentUser() user: AuthenticatedUser, @Body() dto: BulkIdsDto) {
    return this.conversationsService.bulkPermanentlyDelete(user.clientId!, dto.ids);
  }

  @Get(':id/messages')
  getMessages(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.conversationsService.getMessages(user.clientId!, id);
  }

  @Get(':id/lead')
  getLead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.conversationsService.getLead(user.clientId!, id);
  }

  @Post(':id/messages')
  sendManual(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SendMessageDto) {
    return this.conversationsService.sendManual(user.clientId!, id, dto.content);
  }

  @Post('messages/:messageId/approve')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('messageId') messageId: string, @Body() dto: ApproveDraftDto) {
    return this.conversationsService.approveDraft(user.clientId!, messageId, user.userId, dto.editedContent);
  }

  @Post('messages/:messageId/reject')
  reject(@CurrentUser() user: AuthenticatedUser, @Param('messageId') messageId: string) {
    return this.conversationsService.rejectDraft(user.clientId!, messageId);
  }
}

/** Every customer who has messaged in, with whatever details the automation has captured about them. */
@Controller('client/contacts')
@Roles(UserRole.CLIENT)
@UseGuards(FeatureGuard)
@RequireFeature('WHATSAPP_AUTOMATION')
export class ContactsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.conversationsService.listContacts(user.clientId!);
  }
}
