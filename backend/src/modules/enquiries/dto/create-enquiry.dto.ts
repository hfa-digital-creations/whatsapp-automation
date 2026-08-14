import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEnquiryDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsString()
  @MaxLength(20)
  phone: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
