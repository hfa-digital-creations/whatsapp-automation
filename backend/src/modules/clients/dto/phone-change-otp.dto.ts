import { IsString, Length, MaxLength, MinLength } from 'class-validator';

export class RequestPhoneChangeOtpDto {
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  newPhone: string;
}

export class ConfirmPhoneChangeOtpDto {
  @IsString()
  requestId: string;

  @IsString()
  @Length(6, 6)
  code: string;
}
