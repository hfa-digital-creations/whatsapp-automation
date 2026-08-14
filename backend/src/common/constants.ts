/** Reserved sessionId for the platform's own WhatsApp number, used to deliver
 * activation/renewal notifications to clients (spec §49 WHATSAPP_NOTIFICATION_NUMBER).
 * Not tied to any client — managed by the admin from System Settings. */
export const SYSTEM_WHATSAPP_SESSION_ID = 'system_notifications';

/**
 * Emitted whenever a payment (manual or Razorpay-verified) is marked SUCCESS.
 * Decouples receipt delivery from PaymentsService the same way
 * WHATSAPP_MESSAGE_RECEIVED_EVENT decouples the automation engine — avoids a
 * circular module dependency (Payments/Subscription <-> Notifications <-> Whatsapp).
 */
export const PAYMENT_SUCCEEDED_EVENT = 'payment.succeeded';

export interface PaymentSucceededEvent {
  paymentId: string;
}
