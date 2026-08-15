import { IsIn, IsOptional, IsString } from 'class-validator';

export class SendOfferDto {
  @IsIn(['ALL_CLIENTS', 'ACTIVE_CLIENTS'])
  target: 'ALL_CLIENTS' | 'ACTIVE_CLIENTS';

  @IsOptional()
  @IsString()
  messageOverride?: string;
}
