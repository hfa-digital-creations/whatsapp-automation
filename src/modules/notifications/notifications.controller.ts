import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { WhatsappSessionManagerService } from '../whatsapp/whatsapp-session-manager.service';
import { RequestPairingCodeDto } from '../whatsapp/dto/request-pairing-code.dto';
import { SYSTEM_WHATSAPP_SESSION_ID } from '../../common/constants';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.listForUser(user.userId);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notificationsService.markRead(user.userId, id);
  }
}

/** Lets an admin link the platform's own WhatsApp number for transactional notifications. */
@Controller('admin/system/whatsapp')
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class AdminSystemWhatsappController {
  constructor(private readonly sessionManager: WhatsappSessionManagerService) {}

  @Post('init')
  async init() {
    await this.sessionManager.startSession(SYSTEM_WHATSAPP_SESSION_ID);
    return { started: true };
  }

  @Get('qr')
  async qr() {
    const qr = await this.sessionManager.getQrImage(SYSTEM_WHATSAPP_SESSION_ID);
    return {
      qr,
      running: this.sessionManager.isRunning(SYSTEM_WHATSAPP_SESSION_ID),
      status: this.sessionManager.getStatus(SYSTEM_WHATSAPP_SESSION_ID),
    };
  }

  @Post('logout')
  async logout() {
    await this.sessionManager.logout(SYSTEM_WHATSAPP_SESSION_ID);
    return { loggedOut: true };
  }

  @Post('pairing-code')
  async requestPairingCode(@Body() dto: RequestPairingCodeDto) {
    const code = await this.sessionManager.requestPairingCode(SYSTEM_WHATSAPP_SESSION_ID, dto.phoneNumber);
    if (!code) {
      throw new BadRequestException(
        'Could not generate a pairing code right now. Make sure the session has started and try again.',
      );
    }
    return { code };
  }
}
