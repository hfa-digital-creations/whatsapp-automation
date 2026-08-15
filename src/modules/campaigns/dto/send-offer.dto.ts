import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export class SendOfferDto {
  @IsIn(['ALL_CLIENTS', 'ACTIVE_CLIENTS', 'SPECIFIC_CLIENTS'])
  target: 'ALL_CLIENTS' | 'ACTIVE_CLIENTS' | 'SPECIFIC_CLIENTS';

  @IsOptional()
  @IsString()
  messageOverride?: string;

  /** Required when target is SPECIFIC_CLIENTS — the exact clients to send this offer to. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  clientIds?: string[];
}
