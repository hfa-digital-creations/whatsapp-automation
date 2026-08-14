export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Randomized (never fixed-interval) delay between bulk outbound WhatsApp sends.
 * WhatsApp's automated-behavior detection flags fixed-interval sending as a bot
 * signal — a random human-like gap between messages is one of the few concrete
 * mitigations available on top of an unofficial (whatsapp-web.js) session.
 */
export function humanSendDelayMs(minMs = 3000, maxMs = 8000): number {
  return minMs + Math.random() * (maxMs - minMs);
}
