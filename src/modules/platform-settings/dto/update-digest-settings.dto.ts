import { IsOptional, IsString, Matches } from 'class-validator';

export class UpdateDigestSettingsDto {
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'dailyDigestTime must be in 24-hour HH:mm format.' })
  dailyDigestTime!: string;

  /** Digits only (with country code), or blank/omitted to disable WhatsApp delivery of the report. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{7,15}$/, { message: 'dailyDigestWhatsappNumber must be digits only (with country code), e.g. 919876543210.' })
  dailyDigestWhatsappNumber?: string;
}
