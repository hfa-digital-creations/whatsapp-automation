import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { PrismaModule } from './common/services/prisma.module';
import { AiModule } from './common/services/ai.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PasswordChangeGuard } from './common/guards/password-change.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ClientsModule } from './modules/clients/clients.module';
import { PlansModule } from './modules/plans/plans.module';
import { FeaturesModule } from './modules/features/features.module';
import { VouchersModule } from './modules/vouchers/vouchers.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { EnquiriesModule } from './modules/enquiries/enquiries.module';
import { BrandingModule } from './modules/branding/branding.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { TrainingModule } from './modules/training/training.module';
import { AutomationModule } from './modules/automation/automation.module';
import { QuotationsModule } from './modules/quotations/quotations.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { PlatformSettingsModule } from './modules/platform-settings/platform-settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }] }),
    PrismaModule,
    AiModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    PlansModule,
    FeaturesModule,
    VouchersModule,
    PaymentsModule,
    SubscriptionModule,
    WhatsappModule,
    NotificationsModule,
    EnquiriesModule,
    BrandingModule,
    AuditLogModule,
    JobsModule,
    DashboardModule,
    TrainingModule,
    AutomationModule,
    QuotationsModule,
    CampaignsModule,
    WebhooksModule,
    PlatformSettingsModule,
  ],
  providers: [
    // Order matters: authenticate -> enforce first-login password change -> check role.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PasswordChangeGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
