import { IsString, MaxLength, MinLength } from 'class-validator';

export class RequestPairingCodeDto {
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  phoneNumber: string;
}
