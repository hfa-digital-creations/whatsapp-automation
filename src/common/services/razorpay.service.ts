import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

/**
 * Thin wrapper over Razorpay's REST API. Deliberately dependency-free (native
 * fetch, Node's own crypto) rather than pulling in the razorpay SDK for what
 * is really two calls: create an order, verify a signature.
 */
@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);
  private readonly keyId?: string;
  private readonly keySecret?: string;
  private readonly webhookSecret?: string;

  constructor(private readonly config: ConfigService) {
    this.keyId = this.config.get<string>('RAZORPAY_KEY_ID') || undefined;
    this.keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET') || undefined;
    this.webhookSecret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET') || undefined;
  }

  /** Public key id only — safe to hand to the frontend for opening Checkout. */
  getPublicKeyId(): string | null {
    return this.keyId ?? null;
  }

  /** Order creation and signature verification both need the secret; checkout does not. */
  isReadyForCheckout(): boolean {
    return Boolean(this.keyId && this.keySecret);
  }

  isWebhookConfigured(): boolean {
    return Boolean(this.webhookSecret);
  }

  /**
   * Creates a Razorpay order for `amountRupees`. Amount is always computed
   * server-side by the caller (plan price minus voucher discount) — never
   * accepted from the frontend.
   */
  async createOrder(params: { amountRupees: number; currency: string; receipt: string }): Promise<RazorpayOrder> {
    if (!this.keyId || !this.keySecret) {
      throw new Error('Razorpay is not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
    }

    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Math.round(params.amountRupees * 100), // Razorpay expects paise
        currency: params.currency,
        receipt: params.receipt,
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.logger.error(`Razorpay order creation failed: ${res.status} ${JSON.stringify(body)}`);
      throw new Error(body?.error?.description || 'Failed to create Razorpay order.');
    }
    return body as RazorpayOrder;
  }

  /** Verifies the checkout.js success callback's HMAC-SHA256(order_id|payment_id). */
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    if (!this.keySecret) return false;
    const expected = crypto
      .createHmac('sha256', this.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    return this.timingSafeEqual(expected, signature);
  }

  /** Verifies an inbound webhook body against X-Razorpay-Signature. */
  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!this.webhookSecret) return false;
    const expected = crypto.createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    return this.timingSafeEqual(expected, signature);
  }

  private timingSafeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }
}
