import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { SubscriptionProcessor } from './subscription.processor';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // BullMQ's `connection` takes an ioredis instance or a plain options object —
        // not a { url } shorthand — so parse REDIS_URL into a real client here.
        connection: new Redis(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379', {
          maxRetriesPerRequest: null,
        }),
      }),
    }),
    BullModule.registerQueue({ name: 'subscription' }),
    SubscriptionModule,
  ],
  providers: [SubscriptionProcessor],
})
export class JobsModule implements OnModuleInit {
  constructor(@InjectQueue('subscription') private readonly subscriptionQueue: Queue) {}

  async onModuleInit() {
    // Repeatable jobs are deduped by BullMQ on (name + repeat pattern), so this
    // is safe to call on every boot without creating duplicate schedules.
    await this.subscriptionQueue.add(
      'refresh-expired',
      {},
      { repeat: { pattern: '0 * * * *' }, jobId: 'refresh-expired-hourly' },
    );
  }
}
