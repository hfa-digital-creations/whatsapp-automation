import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Enquiry, EnquirySource, EnquiryStatus, MessageStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { AiService } from '../../common/services/ai.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EnquiryAutomationService } from './enquiry-automation.service';
import { CreateEnquiryDto } from './dto/create-enquiry.dto';
import { UpdateEnquiryDto } from './dto/update-enquiry.dto';
import { ClientsService } from '../clients/clients.service';
import { TrainingService } from '../training/training.service';
import { PlansService } from '../plans/plans.service';

/**
 * Turns the little the prospect told us on the landing page (industry + free-text
 * requirements) into a starting business-profile document for their own WhatsApp AI —
 * this becomes a TEXT training source the moment their client account is activated, so
 * the admin never has to hand-write training content the way earlier onboarding required.
 */
const BUSINESS_PROFILE_SYSTEM_PROMPT = `You write a short, structured business-profile document used to train a
WhatsApp AI assistant for a business owner who just signed up. The document becomes that assistant's starting
knowledge base for replying to the business's own customers.

Rules:
- Use ONLY the information given below (their industry and their own description of what they need). Never invent
  specific prices, discounts, certifications, guarantees, years of experience, staff counts, or any other concrete
  fact that wasn't actually stated.
- Structure it as short labeled sections: "Business Identity" (name, industry, and a one-line summary of what they
  told us), "Likely Services" (phrased as "businesses in this industry typically offer..." — a helpful starting
  guess, not asserted as confirmed fact), and "Assistant Guidance" (instruct the assistant to ask the customer for
  specifics rather than guessing, and to never quote a price, policy, or timeline that the business hasn't
  separately confirmed in its own training content).
- Keep it concise — this is a starting point the business owner is expected to edit and expand, not a final document.
- Output ONLY the document text — no preamble, no markdown headers, no quotes around it.`;

@Injectable()
export class EnquiriesService {
  private readonly logger = new Logger(EnquiriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly notificationsService: NotificationsService,
    private readonly enquiryAutomation: EnquiryAutomationService,
    private readonly clientsService: ClientsService,
    private readonly trainingService: TrainingService,
    private readonly plansService: PlansService,
  ) {}

  async create(dto: CreateEnquiryDto) {
    // Every enquiry must point at a real, currently-published plan — it's what the AI
    // outreach/reply conversation centers on (see EnquiryAutomationService.buildSystemPrompt)
    // and what the admin's Approve & Activate flow defaults to.
    const plans = await this.plansService.list({ publicOnly: true });
    if (!plans.some((p) => p.id === dto.planId)) {
      throw new BadRequestException('Select a valid plan.');
    }

    const enquiry = await this.prisma.enquiry.create({ data: dto });

    const admins = await this.prisma.user.findMany({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] } } });
    await Promise.all(
      admins.map((admin) =>
        this.notificationsService.notifyInApp(
          admin.id,
          'NEW_ENQUIRY',
          'New enquiry received',
          `${dto.name} (${dto.phone}) submitted an enquiry.`,
        ),
      ),
    );

    // Fire-and-forget: the public enquiry form must not wait on an AI call + WhatsApp/email
    // send before it gets a response, and a slow/failed outreach should never fail the
    // enquiry submission itself.
    this.enquiryAutomation
      .sendInitialOutreach(enquiry)
      .catch((err) => this.logger.warn(`Automatic outreach failed for enquiry ${enquiry.id}: ${err.message}`));

    return enquiry;
  }

  /**
   * `source` defaults to LANDING_PAGE — a direct WhatsApp message with no matching form
   * submission (see EnquiryAutomationService.replyAsGeneralSalesExecutive) never shows up
   * in the default Enquiries view; the admin panel explicitly asks for `source: WHATSAPP`
   * to see those in their own separate tab.
   */
  list(params: { status?: EnquiryStatus; source?: EnquirySource; skip?: number; take?: number }) {
    const { status, source = EnquirySource.LANDING_PAGE, skip = 0, take = 50 } = params;
    return this.prisma.enquiry.findMany({ where: { status, source }, orderBy: { createdAt: 'desc' }, skip, take });
  }

  getMessages(id: string) {
    return this.enquiryAutomation.getMessages(id);
  }

  /** Corrects contact-detail typos on an existing enquiry — most commonly a phone number
   *  submitted without its country code (see UpdateEnquiryDto), which otherwise silently
   *  sends WhatsApp messages nowhere near the actual prospect. */
  async update(id: string, dto: UpdateEnquiryDto) {
    const enquiry = await this.prisma.enquiry.findUnique({ where: { id } });
    if (!enquiry) throw new NotFoundException('Enquiry not found.');
    return this.prisma.enquiry.update({ where: { id }, data: dto });
  }

  async updateStatus(id: string, status: EnquiryStatus) {
    const enquiry = await this.prisma.enquiry.findUnique({ where: { id } });
    if (!enquiry) throw new NotFoundException('Enquiry not found.');
    const updated = await this.prisma.enquiry.update({ where: { id }, data: { status } });

    if (status === EnquiryStatus.CONVERTED && enquiry.status !== EnquiryStatus.CONVERTED) {
      this.enquiryAutomation
        .notifyAdminOfConversion(updated)
        .catch((err) => this.logger.warn(`Conversion notification failed for enquiry ${id}: ${err.message}`));
    }

    return updated;
  }

  /**
   * The admin's whole job for turning an enquiry into a paying client: pick a plan, click
   * once. Everything else — creating the account, drafting a starting knowledge base from
   * what the prospect already told us, and sending login credentials — happens here.
   * `planId` is optional and defaults to the plan the prospect themselves chose on the
   * landing form — the admin only needs to override it if they want a different plan.
   */
  async approveAndActivate(enquiryId: string, planId: string | undefined, adminId: string, ipAddress?: string) {
    const enquiry = await this.prisma.enquiry.findUnique({ where: { id: enquiryId } });
    if (!enquiry) throw new NotFoundException('Enquiry not found.');
    if (enquiry.status === EnquiryStatus.CONVERTED) {
      throw new BadRequestException('This enquiry has already been converted.');
    }
    if (!enquiry.email) {
      throw new BadRequestException(
        'This enquiry has no email on file — a client login requires one. Ask the prospect for their email, or create the client manually from the Clients panel.',
      );
    }
    const resolvedPlanId = planId ?? enquiry.planId ?? undefined;
    if (!resolvedPlanId) {
      throw new BadRequestException('Select a plan to activate.');
    }

    const client = await this.clientsService.create({
      businessName: enquiry.businessName || enquiry.name,
      email: enquiry.email,
      phone: enquiry.phone,
      planId: resolvedPlanId,
    });

    // Fire-and-forget — a slow/failed AI draft must never block or fail the activation
    // itself; the client can always add/edit their own training content afterward.
    this.generateInitialTraining(client.id, enquiry).catch((err) =>
      this.logger.warn(`Automatic training generation failed for client ${client.id} (enquiry ${enquiry.id}): ${err.message}`),
    );

    const activated = await this.clientsService.activate(
      client.id,
      adminId,
      { planId: resolvedPlanId, note: `Auto-created from enquiry ${enquiry.id}` },
      ipAddress,
    );

    await this.updateStatus(enquiryId, EnquiryStatus.CONVERTED);

    return activated;
  }

  /**
   * Approves a QUEUED AI-drafted enquiry reply (enquiryAutomationMode DRAFT_APPROVE),
   * optionally edited, and sends it — mirrors ConversationsService.approveDraft() exactly,
   * just sending via the stored enquiry phone (notificationsService.sendCustom, the same
   * path sendInitialOutreach already uses) rather than a per-client WhatsApp account.
   */
  async approveDraft(messageId: string, adminId: string, editedContent?: string) {
    const message = await this.prisma.enquiryMessage.findUnique({ where: { id: messageId }, include: { enquiry: true } });
    if (!message) throw new NotFoundException('Draft message not found.');
    if (message.status !== MessageStatus.QUEUED) {
      throw new ForbiddenException('This message has already been sent or discarded.');
    }

    const finalContent = editedContent?.trim() || message.content;
    const result = await this.notificationsService.sendCustom({
      phone: message.enquiry.phone,
      subject: message.enquiry.name,
      whatsappMessage: finalContent,
    });

    return this.prisma.enquiryMessage.update({
      where: { id: messageId },
      data: {
        content: finalContent,
        status: result.whatsappSent ? MessageStatus.SENT : MessageStatus.FAILED,
        approvedByUserId: adminId,
      },
    });
  }

  async rejectDraft(messageId: string) {
    const message = await this.prisma.enquiryMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Draft message not found.');
    if (message.status !== MessageStatus.QUEUED) {
      throw new ForbiddenException('This message has already been sent or discarded.');
    }
    await this.prisma.enquiryMessage.delete({ where: { id: messageId } });
    return { rejected: true };
  }

  private async generateInitialTraining(clientId: string, enquiry: Enquiry) {
    if (!this.ai.isConfigured) return;

    const prompt = `Business name: ${enquiry.businessName ?? enquiry.name}
Industry: ${enquiry.businessType ?? 'not specified'}
What they told us about their needs: ${enquiry.message ?? '(nothing specific provided)'}`;

    const content = await this.ai.complete({ system: BUSINESS_PROFILE_SYSTEM_PROMPT, prompt, maxTokens: 500 });
    if (!content) return;

    await this.trainingService.createText(clientId, { title: 'Business Profile (auto-generated from signup)', content });
  }
}
