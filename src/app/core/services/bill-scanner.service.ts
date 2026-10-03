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
  siteUrl?: string;
  siteName?: string;
}

export const DEFAULT_EXTRACTION_PROMPT =
  'Output ONLY a JSON object with the merchant name as \'title\' and total expense as \'total_amount\'. ' +
  'No other text. Example: {"title": "Starbucks", "total_amount": "5.50"}';

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
    const fromSettings = this.appSettings.openRouterApiKey();
    if (fromSettings) {
      return fromSettings;
    }
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('rupa_openrouter_api_key') || localStorage.getItem('openrouter_api_key');
      if (stored) return stored;
    }
    return '';
  }

  /**
   * Scans a bill image (File or Blob) using OpenRouter Vision API.
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
      throw new Error('OpenRouter API key is missing. Please set your key first.');
    }

    const model = options.model || 'qwen/qwen3-vl-8b-instruct';
    const baseUrl = options.baseUrl || 'https://openrouter.ai/api/v1';

    const imageUrl = await this.toDataUrl(file);

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    if (options.siteUrl) {
      headers['HTTP-Referer'] = options.siteUrl;
    }
    if (options.siteName) {
      headers['X-Title'] = options.siteName;
    }

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

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const latencyMs = performance.now() - startTime;

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenRouter API error (${response.status} ${response.statusText}): ${errorBody}`);
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
