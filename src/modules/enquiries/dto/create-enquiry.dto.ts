import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizePhone } from '../../../common/utils/phone.util';

/** Post-normalization safety net — normalizePhone() already fixes the common "forgot the
 * country code" case (a bare 10-digit Indian mobile number), so anything that still fails
 * this is genuinely too short/long to be a real number, not just missing a prefix. */
const PLAUSIBLE_PHONE = /^\d{11,15}$/;

export class CreateEnquiryDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @Transform(({ value }) => (typeof value === 'string' ? normalizePhone(value) : value))
  @Matches(PLAUSIBLE_PHONE, {
    message: 'Please enter a valid phone number, e.g. +919876543210.',
  })
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  /** Which plan they want — required so the AI outreach/reply conversation can center on it
   * and gather what setting it up actually needs (see EnquiryAutomationService). Existence
   * and ACTIVE status are checked in EnquiriesService.create(), not here (needs a DB lookup). */
  @IsString()
  planId: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  businessType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
