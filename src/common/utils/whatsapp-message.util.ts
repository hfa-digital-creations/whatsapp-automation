/**
 * Text to persist for an inbound WhatsApp message. The raw image bytes are only ever sent to
 * the AI once, in the turn they arrive (see AiService.chat()'s `image` param) — they're never
 * stored or re-decoded — so a photo with no caption needs *some* readable placeholder or the
 * message history (and the admin's view of the conversation) would show a blank line.
 */
export function inboundMessageContent(body: string, hasImage: boolean): string {
  if (body.trim()) return hasImage ? `[Image] ${body}` : body;
  return hasImage ? '[Image] (no caption)' : body;
}
