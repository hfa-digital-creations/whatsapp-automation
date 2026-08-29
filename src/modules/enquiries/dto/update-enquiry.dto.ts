import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizePhone } from '../../../common/utils/phone.util';

const PLAUSIBLE_PHONE = /^\d{11,15}$/;

/** Lets an admin correct contact-detail typos — most commonly a phone number submitted
 * without its country code, e.g. via the landing page. See CreateEnquiryDto: the same
 * auto-normalization (a bare 10-digit number gets "91" prepended) applies here too, so
 * typing the corrected number back in with or without the prefix both work. */
export class UpdateEnquiryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? normalizePhone(value) : value))
  @Matches(PLAUSIBLE_PHONE, {
    message: 'Please enter a valid phone number, e.g. +919876543210.',
  })
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  businessType?: string;
}
