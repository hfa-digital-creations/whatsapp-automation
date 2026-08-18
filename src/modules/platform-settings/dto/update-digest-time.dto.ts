import { IsString, Matches } from 'class-validator';

export class UpdateDigestTimeDto {
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'dailyDigestTime must be in 24-hour HH:mm format.' })
  dailyDigestTime!: string;
}
