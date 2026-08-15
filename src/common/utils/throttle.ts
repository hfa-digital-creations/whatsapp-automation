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

/**
 * Longer randomized pause between BATCHES of bulk sends (as opposed to between
 * individual messages within a batch). Sized so a batch of 5 plus this pause
 * keeps the account comfortably under ~60 messages/hour — the threshold widely
 * reported as triggering WhatsApp's automated-behavior restrictions — while
 * still finishing a real client list in a reasonable time. Default 5-7 minutes.
 */
export function batchPauseMs(minMs = 5 * 60_000, maxMs = 7 * 60_000): number {
  return minMs + Math.random() * (maxMs - minMs);
}
