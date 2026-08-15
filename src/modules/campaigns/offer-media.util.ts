export type OfferMediaType = 'IMAGE' | 'VIDEO' | 'DOCUMENT';

interface OfferMediaRule {
  type: OfferMediaType;
  maxBytes: number;
}

// Sized conservatively below WhatsApp's own per-type limits (roughly 16MB for
// images/video, 100MB for documents) — a 1-vCPU/4GB host buffering the whole
// file in memory during upload makes a generous ceiling a real resource risk.
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const VIDEO_MAX_BYTES = 16 * 1024 * 1024;
const DOCUMENT_MAX_BYTES = 16 * 1024 * 1024;

const EXTENSION_RULES: Record<string, OfferMediaRule> = {
  jpg: { type: 'IMAGE', maxBytes: IMAGE_MAX_BYTES },
  jpeg: { type: 'IMAGE', maxBytes: IMAGE_MAX_BYTES },
  png: { type: 'IMAGE', maxBytes: IMAGE_MAX_BYTES },
  webp: { type: 'IMAGE', maxBytes: IMAGE_MAX_BYTES },
  gif: { type: 'IMAGE', maxBytes: IMAGE_MAX_BYTES },
  mp4: { type: 'VIDEO', maxBytes: VIDEO_MAX_BYTES },
  '3gp': { type: 'VIDEO', maxBytes: VIDEO_MAX_BYTES },
  mov: { type: 'VIDEO', maxBytes: VIDEO_MAX_BYTES },
  pdf: { type: 'DOCUMENT', maxBytes: DOCUMENT_MAX_BYTES },
};

export const ALLOWED_OFFER_MEDIA_EXTENSIONS = Object.keys(EXTENSION_RULES);
export const MAX_OFFER_MEDIA_BYTES = Math.max(...Object.values(EXTENSION_RULES).map((r) => r.maxBytes));

export function resolveOfferMediaRule(originalName: string): OfferMediaRule | null {
  const ext = originalName.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_RULES[ext] ?? null;
}
