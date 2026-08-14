import { IsString } from 'class-validator';

export class VerifyPaymentDto {
  @IsString()
  paymentId: string;

  @IsString()
  razorpayOrderId: string;

  @IsString()
  razorpayPaymentId: string;

  @IsString()
  razorpaySignature: string;
}
