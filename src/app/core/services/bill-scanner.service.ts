import { Injectable, inject } from '@angular/core';
import { AppSettingsService } from './app-settings.service';

export interface ExtractionResult {
  title: string | null;
  total_amount: string | null;
  raw_output: string;
  latency_ms: number;
  parsed_json: Record<string, any> | null;
}

export interface ExtractOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export const DEFAULT_EXTRACTION_PROMPT =
  'Output ONLY a JSON object with the merchant name as \'title\' and total expense as \'total_amount\'. ' +
  'No other text. Example: {"title": "Starbucks", "total_amount": "5.50"}';

/**
 * Built-in AI provider fallbacks, used only when the matching
 * `app_settings` column is NULL — the runtime values come from Supabase
 * (ai_base_url / ai_model / ai_api_key / ai_headers, migration 0023), so
 * changing provider or model never requires a code change.
 *
 * Any OpenAI-compatible provider works: the app always POSTs to
 * `{base_url}/chat/completions` with `Authorization: Bearer <key>`.
 */
export const DEFAULT_AI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
export const DEFAULT_AI_MODEL = 'gemini-3.8-flash';

const HEIC_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

const PRIORITY_AMOUNT_KEYS = [
  'total_amount',
  'grand_total',
  'total_expense',
  'total',
  'total_price',
  'amount',
  'expense',
  'price',
];

@Injectable({
  providedIn: 'root',
})
export class BillScannerService {
  private readonly appSettings = inject(AppSettingsService);

  private getApiKey(): string {
    return this.appSettings.aiApiKey();
  }

  /**
   * Scans a bill image (File or Blob) using the configured AI provider via
   * its OpenAI-compatible chat completions endpoint. Provider endpoint, model
   * and extra headers are read from Supabase `app_settings` (see
   * `AppSettingsService`); per-call `options` override them for tests.
   */
  async extractBill(
    file: File | Blob,
    prompt: string = DEFAULT_EXTRACTION_PROMPT,
    options: ExtractOptions = {}
  ): Promise<ExtractionResult> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('You are offline. AI bill scanning requires an active internet connection.');
    }

    const apiKey = options.apiKey || this.getApiKey();
    if (!apiKey) {
      throw new Error('AI API key is missing. Please set your key first.');
    }

    const model = options.model || this.appSettings.aiModel() || DEFAULT_AI_MODEL;
    const baseUrl = (
      options.baseUrl ||
      this.appSettings.aiBaseUrl() ||
      DEFAULT_AI_BASE_URL
    ).replace(/\/+$/, '');

    const image = await this.normalizeImage(file);
    const imageUrl = await this.toDataUrl(image);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      // Provider-specific extras from app_settings.ai_headers win over the
      // defaults, so a provider that authenticates differently (x-api-key,
      // or no Authorization at all) works without a code change.
      ...(this.appSettings.aiHeaders() ?? {}),
    };

    const payload = {
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    };

    const startTime = performance.now();

    const response = await this.postChat(
      `${baseUrl}/chat/completions`,
      headers,
      JSON.stringify(payload),
    );

    const latencyMs = performance.now() - startTime;

    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status === 429 || response.status === 503) {
        throw new Error('The AI service is busy right now. Please try again in a moment.');
      }
      throw new Error(`AI provider error (${response.status} ${response.statusText}): ${errorBody}`);
    }

    const data: any = await response.json();
    const rawOutput = data.choices?.[0]?.message?.content?.trim() ?? '';

    let title: string | null = null;
    let totalAmount: string | null = null;

    const parsed = this.extractJsonFromText(rawOutput);
    if (parsed) {
      title =
        parsed['title'] ||
        parsed['merchant_name'] ||
        parsed['store_name'] ||
        parsed['customer_name'] ||
        null;
      if (title !== null) {
        title = String(title);
      }
      totalAmount = this.findAmountInJson(parsed);
    }

    return {
      title,
      total_amount: totalAmount,
      raw_output: rawOutput,
      latency_ms: latencyMs,
      parsed_json: parsed,
    };
  }

  /**
   * POSTs to the chat-completions endpoint, retrying transient capacity
   * errors (429/503) with a short backoff. Gemini demand spikes usually
   * clear within a couple of seconds, and the scan is a read-only call,
   * so retrying is safe.
   */
  private async postChat(
    url: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<Response> {
    const maxAttempts = 3;
    for (let attempt = 1; ; attempt++) {
      const response = await fetch(url, { method: 'POST', headers, body });
      const retriable = response.status === 429 || response.status === 503;
      if (response.ok || !retriable || attempt >= maxAttempts) {
        return response;
      }
      // Release the unread error body before retrying on this connection.
      void response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }

  /**
   * HEIC/HEIF (the default camera format on iPhone) is transcoded to JPEG
   * in the browser before upload, because providers don't reliably decode
   * `data:image/heic` payloads — they silently return unusable output while
   * plain JPEG works. Other formats pass through untouched.
   *
   * Order: native decode (iOS Safari, recent Android Chrome — also
   * downscales to ≤2048px) → heic2any WASM decoder (desktop browsers
   * without HEIC support) → clear error.
   */
  private async normalizeImage(file: File | Blob): Promise<Blob> {
    if (!this.isHeic(file)) return file;

    const native = await this.transcodeViaCanvas(file);
    if (native) return native;

    try {
      const { default: heic2any } = await import('heic2any');
      const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
      const converted = Array.isArray(out) ? out[0] : out;
      if (converted) return converted;
    } catch (err) {
      console.error('HEIC conversion failed', err);
    }

    throw new Error(
      "This HEIC/HEIF photo can't be read in this browser. Convert it to JPEG (or re-take the photo as JPEG) and try again.",
    );
  }

  private isHeic(file: File | Blob): boolean {
    const type = (file as File).type?.toLowerCase() ?? '';
    if (HEIC_MIME_TYPES.has(type)) return true;
    // Some pickers report an empty type — fall back to the file extension.
    const name = (file as File).name ?? '';
    return /\.hei[cf]$/i.test(name);
  }

  /**
   * Decodes the image via an <img> element and re-encodes it as JPEG on a
   * canvas (downscaling to ≤2048px so multi-megapixel photos don't bloat
   * the payload). Resolves null when the browser can't decode the format.
   */
  private transcodeViaCanvas(file: Blob): Promise<Blob | null> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 2048;
          const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
          const width = Math.max(1, Math.round(img.naturalWidth * scale));
          const height = Math.max(1, Math.round(img.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(url);
              resolve(blob);
            },
            'image/jpeg',
            0.85,
          );
        } catch {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  /**
   * Helper to convert browser File / Blob into base64 Data URL.
   */
  private toDataUrl(file: File | Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Robustly extract the first valid JSON object embedded in model text output.
   */
  private extractJsonFromText(text: string): Record<string, any> | null {
    if (!text) return null;
    const start = text.indexOf('{');
    if (start === -1) return null;

    let depth = 0;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(start, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }

  /**
   * Recursively search object for total expense / total amount keys.
   */
  private findAmountInJson(obj: any): string | null {
    if (!obj || typeof obj !== 'object') return null;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (typeof item === 'object' && item !== null) {
          const found = this.findAmountInJson(item);
          if (found !== null) return found;
        }
      }
      return null;
    }

    const lowerKeyMap = new Map<string, any>();
    for (const [key, value] of Object.entries(obj)) {
      lowerKeyMap.set(key.toLowerCase(), value);
    }

    for (const key of PRIORITY_AMOUNT_KEYS) {
      const val = lowerKeyMap.get(key);
      if (val !== undefined && val !== null && typeof val !== 'object') {
        return String(val);
      }
    }

    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) {
        const found = this.findAmountInJson(value);
        if (found !== null) return found;
      }
    }

    return null;
  }
}
