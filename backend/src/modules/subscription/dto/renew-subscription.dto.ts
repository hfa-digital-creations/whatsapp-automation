import { IsOptional, IsString } from 'class-validator';

export class RenewSubscriptionDto {
  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsString()
  voucherCode?: string;
}
