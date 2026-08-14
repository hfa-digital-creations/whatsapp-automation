import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SimulateMessageDto {
  @IsString()
  @MinLength(5)
  @MaxLength(20)
  fromPhone: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerName?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;
}
