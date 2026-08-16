import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// @IsOptional() is deliberate here (not the ValidateIf(!== undefined) pattern used
// elsewhere) — unlike most fields, an explicit `null` on the media fields is a real,
// meaningful instruction ("clear the attachment"), not an invalid value to reject.
export class UpdateOfferDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @IsString()
  mediaUrl?: string | null;

  @IsOptional()
  @IsIn(['IMAGE', 'VIDEO', 'DOCUMENT'])
  mediaType?: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  mediaFileName?: string | null;
}
