import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { OfferPhoneRecipient } from './send-offer.dto';

/** A client's own campaign only ever targets their own customers — never other platform tenants. */
export class SendClientOfferDto {
  @IsIn(['PHONE_NUMBERS', 'GROUP'])
  target: 'PHONE_NUMBERS' | 'GROUP';

  @IsString()
  sessionId: string;

  @IsOptional()
  @IsString()
  messageOverride?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  phoneNumbers?: OfferPhoneRecipient[];

  @IsOptional()
  @IsString()
  groupId?: string;
}

export class SendFollowupDto {
  @IsString()
  @MinLength(3)
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;

  /** Only set for a client's follow-up — which of their own connected accounts to send from. */
  @IsOptional()
  @IsString()
  sessionId?: string;
}
