import { Injectable, inject } from '@angular/core';
import { AppSettingsService } from './app-settings.service';
import { DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL } from './bill-scanner.service';
import { Category } from '../../core/models/domain.models';

export interface VoiceEntry {
  amount: number;
  direction: 'in' | 'out';
  category: string | null;
  notes: string | null;
}

export interface VoiceParseResult {
  entries: VoiceEntry[];
  rawText: string;
}

const OUT_KEYWORDS = [
  'expense', 'spent', 'paid', 'pay', 'cost', 'bought', 'purchase',
  'deduct', 'withdraw', 'debited',
];
const IN_KEYWORDS = [
  'income', 'received', 'got', 'salary', 'payback', 'credited',
  'deposited', 'refund', 'earned',
];

@Injectable({ providedIn: 'root' })
export class VoiceExpenseParserService {
  private readonly settings = inject(AppSettingsService);

  /**
   * Parses a voice transcript that may contain multiple expense/income entries
   * into a list of structured entries, reusing the configured AI chat model.
   * Falls back to a lightweight regex parser when the AI call fails.
   */
  async parse(utterance: string, categories: Category[]): Promise<VoiceParseResult> {
    const trimmed = utterance.trim();
    if (!trimmed) return { entries: [], rawText: '' };

    const apiKey = this.settings.aiApiKey();
    if (!apiKey) {
      return { entries: this.fallbackParse(trimmed, categories), rawText: trimmed };
    }

    const model = this.settings.aiModel() || DEFAULT_AI_MODEL;
    const baseUrl = (this.settings.aiBaseUrl() || DEFAULT_AI_BASE_URL).replace(/\/+$/, '');

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...(this.settings.aiHeaders() ?? {}),
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: this.buildSystemPrompt(categories) },
            { role: 'user', content: trimmed },
          ],
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI provider error (${response.status})`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim() ?? '';
      const entries = this.extractJsonArray(content, categories);
      return { entries, rawText: trimmed };
    } catch {
      return { entries: this.fallbackParse(trimmed, categories), rawText: trimmed };
    }
  }

  private buildSystemPrompt(categories: Category[]): string {
    const categoryList = categories.map((c) => c.name).join(', ');
    return (
      'You parse voice expense notes into a JSON array of entries. Each entry: ' +
      '{amount (number), direction ("in" for income/received/salary/payback, "out" for expense/spent/paid), ' +
      'category (best match from the list below or null), notes (optional string)}. ' +
      'Output ONLY a JSON array, e.g. ' +
      '[{"amount":500,"direction":"out","category":"Food","notes":null},{"amount":100,"direction":"in","category":null,"notes":"rashif bill share"}]. ' +
      `Categories: ${categoryList}. No other text.`
    );
  }

  private extractJsonArray(text: string, categories: Category[]): VoiceEntry[] {
    if (!text) return [];
    const start = text.indexOf('[');
    if (start === -1) return [];

    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '[') depth++;
      else if (text[i] === ']') {
        depth--;
        if (depth === 0) {
          try {
            const arr = JSON.parse(text.slice(start, i + 1));
            if (Array.isArray(arr)) {
              return arr
                .map((item) => this.normalizeEntry(item, categories))
                .filter((e): e is VoiceEntry => e !== null);
            }
          } catch {
            return [];
          }
        }
      }
    }
    return [];
  }

  private normalizeEntry(item: any, categories: Category[]): VoiceEntry | null {
    if (!item || typeof item !== 'object') return null;
    const amount = Number(item.amount);
    if (!amount || amount <= 0) return null;

    const direction = this.normalizeDirection(item.direction);
    const category = this.matchCategory(item.category, categories);
    const notes = item.notes ? String(item.notes).trim() || null : null;

    return { amount, direction, category, notes };
  }

  private normalizeDirection(value: any): 'in' | 'out' {
    const raw = String(value ?? '').toLowerCase();
    if (IN_KEYWORDS.some((k) => raw.includes(k))) return 'in';
    return 'out';
  }

  private matchCategory(suggested: any, categories: Category[]): string | null {
    if (!suggested) return null;
    const name = String(suggested).trim();
    if (!name) return null;
    const match = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
    return match ? match.name : null;
  }

  /**
   * Lightweight single-entry fallback when the AI is unavailable. Handles one
   * amount plus direction keywords; multi-entry voice needs the AI path.
   */
  private fallbackParse(utterance: string, categories: Category[]): VoiceEntry[] {
    const amountMatch = utterance.match(/(\d+(?:[.,]\d+)?)/);
    if (!amountMatch) return [];
    const amount = Number(amountMatch[1].replace(',', '.'));
    if (!amount || amount <= 0) return [];

    const lower = utterance.toLowerCase();
    const direction = IN_KEYWORDS.some((k) => lower.includes(k)) ? 'in' : 'out';
    const category = this.matchCategoryFromText(lower, categories);
    return [{ amount, direction, category, notes: null }];
  }

  /**
   * Scans the (lowercased) utterance for any configured category name and
   * returns the first (longest-first) case-insensitive match, mirroring the
   * bill-scanner/QuickAddSheet category mapping so a spoken word like
   * "groceries" resolves to the existing "Groceries" category instead of null.
   */
  private matchCategoryFromText(textLower: string, categories: Category[]): string | null {
    const sorted = [...categories].sort((a, b) => b.name.length - a.name.length);
    for (const c of sorted) {
      if (textLower.includes(c.name.toLowerCase())) return c.name;
    }
    return null;
  }
}
