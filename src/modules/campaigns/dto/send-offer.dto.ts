import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export interface OfferPhoneRecipient {
  phone: string;
  name?: string;
}

export class SendOfferDto {
  @IsIn(['ALL_CLIENTS', 'ACTIVE_CLIENTS', 'SPECIFIC_CLIENTS', 'PHONE_NUMBERS', 'GROUP'])
  target: 'ALL_CLIENTS' | 'ACTIVE_CLIENTS' | 'SPECIFIC_CLIENTS' | 'PHONE_NUMBERS' | 'GROUP';

  @IsOptional()
  @IsString()
  messageOverride?: string;

  /** Required when target is SPECIFIC_CLIENTS — the exact clients to send this offer to. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  clientIds?: string[];

  /** Required when target is PHONE_NUMBERS — manually-entered recipients that may not be registered clients. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  phoneNumbers?: OfferPhoneRecipient[];

  /** Required when target is GROUP — sends to every current member of this saved contact group. */
  @IsOptional()
  @IsString()
  groupId?: string;
}
