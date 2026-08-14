import { IsString, Length } from 'class-validator';

export class VerifyLoginOtpDto {
  @IsString()
  loginOtpId: string;

  @IsString()
  @Length(6, 6)
  code: string;
}
