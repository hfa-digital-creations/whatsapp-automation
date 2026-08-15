import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaymentType } from '@prisma/client';

export class RecordPaymentDto {
  @IsEnum(PaymentType)
  type: PaymentType;

  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsString()
  voucherCode?: string;

  @IsOptional()
  @IsString()
  gateway?: string;

  @IsOptional()
  @IsString()
  gatewayRef?: string;
}
