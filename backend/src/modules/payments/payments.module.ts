import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { VouchersModule } from '../vouchers/vouchers.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { RazorpayService } from '../../common/services/razorpay.service';

@Module({
  imports: [VouchersModule, AuditLogModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, RazorpayService],
  exports: [PaymentsService, RazorpayService],
})
export class PaymentsModule {}
