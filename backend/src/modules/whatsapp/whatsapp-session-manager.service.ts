import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as QRCode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../common/services/prisma.service';
import { WhatsappAccountStatus } from '@prisma/client';
import { sleep } from '../../common/utils/throttle';

// Chromium leaves these behind if the process is killed uncleanly (e.g. a `docker
// restart`) instead of shutting down gracefully. On our own next launch there is no
// genuinely concurrent process, so it's always safe to clear them before starting.
const CHROMIUM_LOCK_FILES = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];

function clearStaleChromiumLocks(dataPath: string, sessionId: string) {
  const profileDir = path.join(dataPath, `session-${sessionId}`);
  for (const lockFile of CHROMIUM_LOCK_FILES) {
    const lockPath = path.join(profileDir, lockFile);
    try {
      fs.rmSync(lockPath, { force: true });
    } catch {
      // profile directory may not exist yet for a brand-new session — fine
    }
  }
}

export const WHATSAPP_MESSAGE_RECEIVED_EVENT = 'whatsapp.message.received';

export interface WhatsappMessageReceivedEvent {
  sessionId: string;
  fromPhone: string;
  customerName: string | null;
  body: string;
}

// whatsapp-web.js has no first-class TypeScript types for our purposes; require keeps
// this resilient to the package's own type gaps across versions.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Client, LocalAuth } = require('whatsapp-web.js');

interface SessionHandle {
  client: any;
  latestQr: string | null;
  status: WhatsappAccountStatus;
}

const RESUMABLE_STATUSES: WhatsappAccountStatus[] = [
  WhatsappAccountStatus.CONNECTED,
  WhatsappAccountStatus.AUTHENTICATED,
  WhatsappAccountStatus.QR_REQUIRED,
  WhatsappAccountStatus.CONNECTING,
];

/**
 * Owns one whatsapp-web.js Client per WhatsappAccount.sessionId. Sessions are
 * kept in an in-memory map — never cross-referenced across clientId — and
 * their auth state is persisted to disk via LocalAuth under
 * WHATSAPP_SESSION_PATH, which must be a Docker volume so reconnects survive
 * container restarts (spec §7, §30).
 */
@Injectable()
export class WhatsappSessionManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappSessionManagerService.name);
  private readonly sessions = new Map<string, SessionHandle>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {}

  async onModuleInit() {
    const resumable = await this.prisma.whatsappAccount.findMany({
      where: { status: { in: RESUMABLE_STATUSES } },
    });
    for (const account of resumable) {
      this.logger.log(`Resuming WhatsApp session ${account.sessionId} after restart`);
      this.startSession(account.sessionId).catch((err) =>
        this.logger.error(`Failed to resume session ${account.sessionId}: ${err.message}`),
      );
    }
  }

  async onModuleDestroy() {
    for (const [sessionId, handle] of this.sessions) {
      try {
        await handle.client.destroy();
      } catch {
        // best-effort cleanup on shutdown
      }
    }
  }

  async startSession(sessionId: string): Promise<void> {
    if (this.sessions.has(sessionId)) return;

    const dataPath = this.config.get<string>('WHATSAPP_SESSION_PATH') ?? './.wwebjs_auth';
    const executablePath = this.config.get<string>('PUPPETEER_EXECUTABLE_PATH');

    clearStaleChromiumLocks(dataPath, sessionId);

    const client = new Client({
      authStrategy: new LocalAuth({ clientId: sessionId, dataPath }),
      // Default protocolTimeout is too tight for Chromium running inside Docker
      // Desktop's WSL2 VM, where CDP round-trips can genuinely take longer —
      // this was causing real "Runtime.callFunctionOn timed out" crashes.
      puppeteer: {
        headless: true,
        executablePath: executablePath || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        protocolTimeout: 300_000,
      },
    });

    const handle: SessionHandle = { client, latestQr: null, status: WhatsappAccountStatus.CONNECTING };
    this.sessions.set(sessionId, handle);
    this.bindClientEvents(sessionId, handle, client);

    await this.updateStatus(sessionId, WhatsappAccountStatus.CONNECTING);
    await this.initializeWithRetry(sessionId, handle, client);
  }

  /**
   * Wires every whatsapp-web.js event this service reacts to onto a given
   * Client instance. Pulled out of startSession() so initializeWithRetry() can
   * rebind the exact same behavior onto a fresh Client after a transient init
   * failure, without duplicating the handler bodies.
   */
  private bindClientEvents(sessionId: string, handle: SessionHandle, client: any) {
    client.on('qr', async (qr: string) => {
      handle.latestQr = qr;
      handle.status = WhatsappAccountStatus.QR_REQUIRED;
      await this.updateStatus(sessionId, WhatsappAccountStatus.QR_REQUIRED);
    });

    client.on('authenticated', async () => {
      handle.latestQr = null;
      handle.status = WhatsappAccountStatus.AUTHENTICATED;
      await this.updateStatus(sessionId, WhatsappAccountStatus.AUTHENTICATED);
    });

    client.on('ready', async () => {
      handle.latestQr = null;
      handle.status = WhatsappAccountStatus.CONNECTED;
      const phoneNumber: string | undefined = client.info?.wid?.user;
      await this.prisma.whatsappAccount
        .update({
          where: { sessionId },
          data: {
            status: WhatsappAccountStatus.CONNECTED,
            phoneNumber,
            lastConnectedAt: new Date(),
          },
        })
        .catch(() => undefined);
    });

    client.on('message', async (msg: any) => {
      // Ignore our own outbound messages, status broadcasts, group chats, and
      // WhatsApp Channel/broadcast-list updates (@newsletter, @broadcast) — none
      // of these are a real 1:1 customer conversation, and a channel JID can't
      // even be replied to, so treating one as an inbound customer message just
      // wastes an AI call and produces an undeliverable draft.
      const NON_CUSTOMER_SUFFIXES = ['@g.us', '@newsletter', '@broadcast'];
      if (msg.fromMe || msg.isStatus || NON_CUSTOMER_SUFFIXES.some((s) => msg.from?.endsWith(s))) return;
      const contact = await msg.getContact().catch(() => null);
      this.events.emit(WHATSAPP_MESSAGE_RECEIVED_EVENT, {
        sessionId,
        fromPhone: (msg.from as string).replace('@c.us', ''),
        customerName: contact?.pushname ?? contact?.name ?? null,
        body: msg.body,
      } satisfies WhatsappMessageReceivedEvent);
    });

    client.on('disconnected', async () => {
      handle.status = WhatsappAccountStatus.DISCONNECTED;
      await this.prisma.whatsappAccount
        .update({
          where: { sessionId },
          data: { status: WhatsappAccountStatus.DISCONNECTED, lastDisconnectedAt: new Date() },
        })
        .catch(() => undefined);
      this.sessions.delete(sessionId);
      // A drop mid-session (not a deliberate logout) — the account was working and
      // should keep working without a human needing to notice and click Reconnect.
      this.logger.warn(`WhatsApp session ${sessionId} disconnected unexpectedly — attempting to reconnect.`);
      this.startSession(sessionId).catch((err) =>
        this.logger.error(`Auto-reconnect failed for session ${sessionId}: ${err.message}`),
      );
    });

    client.on('auth_failure', async () => {
      handle.status = WhatsappAccountStatus.ERROR;
      await this.updateStatus(sessionId, WhatsappAccountStatus.ERROR);
      this.sessions.delete(sessionId);
    });
  }

  /**
   * whatsapp-web.js's own startup sequence reads the WhatsApp Web page (e.g.
   * getWWebVersion) while WhatsApp Web itself is still internally navigating —
   * a real, observed race that throws "Execution context was destroyed, most
   * likely because of a navigation." It's transient, not a real failure: retrying
   * initialize() a couple of times with a short pause almost always succeeds on
   * the next attempt, and a session that gives up on the first hiccup is a
   * session that silently stops receiving customer messages until someone
   * notices and manually reconnects — this keeps trying instead of going idle.
   */
  private async initializeWithRetry(sessionId: string, handle: SessionHandle, client: any, attempt = 1): Promise<void> {
    const MAX_ATTEMPTS = 3;
    try {
      await client.initialize();
    } catch (err: any) {
      const isDestroyedContext = /Execution context was destroyed/i.test(err.message ?? '');
      if (isDestroyedContext && attempt < MAX_ATTEMPTS) {
        this.logger.warn(
          `WhatsApp session ${sessionId} hit a transient navigation race during init (attempt ${attempt}/${MAX_ATTEMPTS}) — retrying.`,
        );
        try {
          await client.destroy();
        } catch {
          // best-effort — the page/browser may already be in a broken state
        }
        await sleep(2000);
        const fresh = new Client({
          authStrategy: new LocalAuth({ clientId: sessionId, dataPath: this.config.get<string>('WHATSAPP_SESSION_PATH') ?? './.wwebjs_auth' }),
          puppeteer: client.options.puppeteer,
        });
        this.bindClientEvents(sessionId, handle, fresh);
        handle.client = fresh;
        await this.initializeWithRetry(sessionId, handle, fresh, attempt + 1);
        return;
      }

      this.logger.error(`WhatsApp session ${sessionId} failed to initialize: ${err.message}`);
      handle.status = WhatsappAccountStatus.ERROR;
      await this.updateStatus(sessionId, WhatsappAccountStatus.ERROR);
      this.sessions.delete(sessionId);
    }
  }

  private async updateStatus(sessionId: string, status: WhatsappAccountStatus) {
    await this.prisma.whatsappAccount
      .update({ where: { sessionId }, data: { status } })
      .catch(() => undefined);
  }

  /**
   * Alternative to scanning a QR code — WhatsApp's "Link with phone number" flow.
   * Switches the session to pairing-code mode and returns an 8-character code
   * (e.g. "ABCD-1234") the user types into WhatsApp on their phone under
   * Linked Devices > Link with phone number. Session must already be started
   * (QR_REQUIRED) — this doesn't create a new session, just changes how the
   * pending one gets authenticated.
   */
  async requestPairingCode(sessionId: string, phoneNumber: string): Promise<string | null> {
    const handle = this.sessions.get(sessionId);
    if (!handle) return null;
    try {
      const digitsOnly = phoneNumber.replace(/\D/g, '');
      return await handle.client.requestPairingCode(digitsOnly);
    } catch (err: any) {
      this.logger.warn(`Failed to request pairing code for ${sessionId}: ${err.message}`);
      return null;
    }
  }

  /**
   * In-memory status, not the DB row — the system notification session has no
   * WhatsappAccount row to read from, so this is the only source of truth that
   * works for both client accounts and the system session alike.
   */
  getStatus(sessionId: string): WhatsappAccountStatus | null {
    return this.sessions.get(sessionId)?.status ?? null;
  }

  async getQrImage(sessionId: string): Promise<string | null> {
    const handle = this.sessions.get(sessionId);
    if (!handle?.latestQr) return null;
    return QRCode.toDataURL(handle.latestQr);
  }

  isRunning(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  async logout(sessionId: string): Promise<void> {
    const handle = this.sessions.get(sessionId);
    if (handle) {
      try {
        await handle.client.logout();
      } catch {
        // fall through to destroy
      }
      try {
        await handle.client.destroy();
      } catch {
        // ignore
      }
      this.sessions.delete(sessionId);
    }
    await this.updateStatus(sessionId, WhatsappAccountStatus.LOGGED_OUT);
  }

  async reconnect(sessionId: string): Promise<void> {
    const handle = this.sessions.get(sessionId);
    if (handle) {
      try {
        await handle.client.destroy();
      } catch {
        // ignore
      }
      this.sessions.delete(sessionId);
    }
    await this.startSession(sessionId);
  }

  /**
   * Used for system/transactional messages (activation credentials, reminders).
   * Best-effort: returns false instead of throwing if the session isn't connected,
   * so callers can fall back to email without failing the whole operation.
   */
  async sendMessage(sessionId: string, toPhone: string, message: string): Promise<boolean> {
    const handle = this.sessions.get(sessionId);
    if (!handle) return false;
    try {
      // toPhone is sometimes already a full WhatsApp JID — inbound messages from a
      // contact WhatsApp only exposes via their privacy-preserving Linked ID (not a
      // real phone number) arrive as "<id>@lid", and that's what we store/reply to.
      // Stripping it down to digits and forcing "@c.us" produces a chat ID for a
      // phone number that was never actually the contact's identity, which WhatsApp
      // rejects outright ("No LID for user"). Only build a @c.us JID when we were
      // given a bare phone number (system notifications, activation messages, etc.).
      const chatId = toPhone.includes('@') ? toPhone : `${toPhone.replace(/\D/g, '')}@c.us`;
      await handle.client.sendMessage(chatId, message);
      return true;
    } catch (err: any) {
      this.logger.warn(`Failed to send WhatsApp message via ${sessionId}: ${err.message}`);
      return false;
    }
  }
}
