import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

// "gemini-flash-latest" (the full flash model) hits its free-tier daily quota
// (20 requests/day) almost immediately. "flash-lite" is a separate model with
// its own quota bucket that's far more generous on the free tier, and is more
// than capable for bounded WhatsApp replies (short, knowledge-grounded, not
// creative writing) — so it's the better default until paid billing is added.
const MODEL = 'gemini-flash-lite-latest';

// Newer Gemini flash models spend part of maxOutputTokens on invisible "thinking"
// tokens before producing visible text — with a small budget that can eat the
// entire response, leaving nothing for the actual reply. This SDK/API version
// combo rejects an explicit thinkingConfig (400 invalid argument), so budgets
// are sized generously instead to comfortably absorb that overhead.

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: GoogleGenerativeAI | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    this.client = apiKey ? new GoogleGenerativeAI(apiKey) : null;
    if (!this.client) {
      this.logger.warn('GEMINI_API_KEY not configured — AI features (knowledge extraction, auto-replies) are disabled.');
    }
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  private extractText(result: any, context: string): string | null {
    const text = result.response.text();
    if (!text) {
      const finishReason = result.response.candidates?.[0]?.finishReason;
      this.logger.warn(`Gemini returned no text for ${context} (finishReason: ${finishReason ?? 'unknown'})`);
      return null;
    }
    return text;
  }

  /** Plain single-turn completion. Returns null (never throws) if the AI provider isn't configured or fails. */
  async complete(params: { system: string; prompt: string; maxTokens?: number }): Promise<string | null> {
    if (!this.client) return null;
    try {
      const model = this.client.getGenerativeModel({
        model: MODEL,
        systemInstruction: params.system,
        generationConfig: { maxOutputTokens: Math.max(params.maxTokens ?? 1024, 2048) },
      });
      const result = await model.generateContent(params.prompt);
      return this.extractText(result, 'complete()');
    } catch (err: any) {
      this.logger.warn(`Gemini completion failed: ${err.message}`);
      return null;
    }
  }

  /** Multi-turn chat used by the conversation engine. The caller supplies the full history each call. */
  async chat(params: {
    system: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    maxTokens?: number;
  }): Promise<string | null> {
    if (!this.client) return null;
    try {
      const model = this.client.getGenerativeModel({
        model: MODEL,
        systemInstruction: params.system,
        generationConfig: { maxOutputTokens: Math.max(params.maxTokens ?? 400, 1536) },
      });
      // Gemini uses "model" instead of "assistant" for the AI's own turns.
      const contents = params.history.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      const result = await model.generateContent({ contents });
      return this.extractText(result, 'chat()');
    } catch (err: any) {
      this.logger.warn(`Gemini chat failed: ${err.message}`);
      return null;
    }
  }
}
