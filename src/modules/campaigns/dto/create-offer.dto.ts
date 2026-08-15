import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateOfferDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @IsOptional()
  @IsIn(['IMAGE', 'VIDEO', 'DOCUMENT'])
  mediaType?: 'IMAGE' | 'VIDEO' | 'DOCUMENT';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  mediaFileName?: string;
}
