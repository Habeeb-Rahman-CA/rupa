import { Injectable, inject } from '@angular/core';
import { AppSettingsService } from './app-settings.service';
import { audioExtension } from './audio-capture.service';

export interface SttTranscribeOptions {
  /** Overrides the derived file name (defaults to `recording.<ext>`). */
  fileName?: string;
  /** ISO-639-1/639-3 code, e.g. 'en', 'hi'. Omitted → provider auto-detects. */
  languageCode?: string;
  /** Overrides app_settings.stt_model when set. */
  model?: string;
  /** Overrides app_settings.stt_base_url when set. */
  baseUrl?: string;
}

/** A fully resolved transcription request handed to a provider transport. */
export interface SttRequest {
  apiKey: string;
  audio: Blob;
  fileName: string;
  /** Provider endpoint, without a trailing slash. */
  baseUrl: string;
  model: string;
  languageCode?: string;
}

export interface SttProvider {
  name: string;
  transcribe(request: SttRequest): Promise<string>;
}

type SttProviderKind = 'elevenlabs' | 'openai';

const DEFAULT_STT_PROVIDER: SttProviderKind = 'elevenlabs';

/** How long to wait for a transcription before failing fast. */
const STT_TIMEOUT_MS = 60_000;

interface SttProviderDefaults {
  label: string;
  baseUrl: string;
  model: string;
}

/**
 * Built-in per-provider fallbacks, used only when the matching
 * `app_settings` column (stt_base_url / stt_model) is NULL/empty — the same
 * options → settings → default order as bill-scanner.service.ts.
 */
const PROVIDER_DEFAULTS: Record<SttProviderKind, SttProviderDefaults> = {
  elevenlabs: {
    label: 'ElevenLabs STT',
    baseUrl: 'https://api.elevenlabs.io/v1',
    model: 'scribe_v3',
  },
  openai: {
    label: 'Whisper STT',
    baseUrl: 'https://api.openai.com/v1',
    model: 'whisper-1',
  },
};

/** Maps the free-text `stt_provider` value onto a known provider kind. */
function resolveProviderKind(name: string | null): SttProviderKind {
  const raw = (name ?? DEFAULT_STT_PROVIDER).trim().toLowerCase();
  if (raw === 'whisper' || raw === 'openai') return 'openai';
  if (raw === 'elevenlabs' || raw === 'eleven_labs' || raw === 'eleven') return 'elevenlabs';
  throw new Error(
    `Unsupported STT provider "${name}". Set it in Settings → AI voice input to one of: elevenlabs, whisper, openai.`,
  );
}

/**
 * Trim to the ISO-639 base subtag ('hi-IN' → 'hi') so both providers get a
 * code they accept. Undefined when no language was configured — callers rely
 * on provider auto-detection rather than a forced English transcription.
 */
function normalizeLanguage(code?: string): string | undefined {
  const trimmed = code?.trim();
  if (!trimmed) return undefined;
  return trimmed.toLowerCase().split(/[-_]/)[0];
}

/**
 * Speech-to-text client that resolves its configuration from `app_settings`
 * (stt_provider / stt_model / stt_base_url / stt_api_key) first and only
 * falls back to the per-provider built-in defaults above — so switching
 * provider, model or endpoint is a database row update, no code change.
 *
 * The API key is required; everything else has a working default, so the
 * feature works out of the box once a key is supplied.
 */
@Injectable({ providedIn: 'root' })
export class SpeechToTextService {
  private readonly settings = inject(AppSettingsService);

  /**
   * Transcribes an audio blob into plain text using the configured STT
   * provider. Throws a descriptive error when offline, misconfigured, or the
   * provider rejects the audio.
   */
  async transcribe(
    audio: Blob,
    options: SttTranscribeOptions = {},
  ): Promise<string> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('You are offline. Voice transcription needs an internet connection.');
    }

    const apiKey = this.settings.sttApiKey();
    if (!apiKey) {
      throw new Error(
        'STT API key is missing. Add your provider key in Settings → AI voice input.',
      );
    }

    const kind = resolveProviderKind(this.settings.sttProvider());
    const defaults = PROVIDER_DEFAULTS[kind];

    const request: SttRequest = {
      apiKey,
      audio,
      fileName: options.fileName || `recording.${audioExtension(audio.type)}`,
      baseUrl: (
        options.baseUrl ||
        this.settings.sttBaseUrl() ||
        defaults.baseUrl
      ).replace(/\/+$/, ''),
      model: options.model || this.settings.sttModel() || defaults.model,
      languageCode: normalizeLanguage(options.languageCode),
    };

    const provider: SttProvider =
      kind === 'openai'
        ? new OpenAiSttProvider(defaults.label)
        : new ElevenLabsSttProvider(defaults.label);

    return provider.transcribe(request);
  }
}

/* ------------------------------------------------------------- Eleven Labs */

class ElevenLabsSttProvider implements SttProvider {
  readonly name = 'elevenlabs';

  constructor(private readonly label: string) {}

  async transcribe(request: SttRequest): Promise<string> {
    const form = new FormData();
    form.append('model_id', request.model);
    if (request.languageCode) form.append('language_code', request.languageCode);
    form.append('file', request.audio, request.fileName);

    const response = await postWithTimeout(
      `${request.baseUrl}/speech-to-text`,
      {
        method: 'POST',
        headers: { 'xi-api-key': request.apiKey },
        body: form,
      },
      this.label,
    );

    return handleResponse(response, this.label);
  }
}

/* --------------------------------------------------------------- Whisper */

class OpenAiSttProvider implements SttProvider {
  readonly name = 'whisper';

  constructor(private readonly label: string) {}

  async transcribe(request: SttRequest): Promise<string> {
    const form = new FormData();
    form.append('file', request.audio, request.fileName);
    form.append('model', request.model);
    form.append('response_format', 'json');
    if (request.languageCode) form.append('language', request.languageCode);

    const response = await postWithTimeout(
      `${request.baseUrl}/audio/transcriptions`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${request.apiKey}` },
        body: form,
      },
      this.label,
    );

    return handleResponse(response, this.label);
  }
}

/* -------------------------------------------------------------- transport */

async function postWithTimeout(
  url: string,
  init: RequestInit,
  label: string,
): Promise<Response> {
  const signal =
    typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
      ? AbortSignal.timeout(STT_TIMEOUT_MS)
      : undefined;

  try {
    return await fetch(url, { ...init, signal });
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new Error(`${label} timed out after ${STT_TIMEOUT_MS / 1000}s. Please try again.`);
    }
    if (err instanceof TypeError) {
      throw new Error(`${label} request failed — check your network connection and try again.`);
    }
    throw err;
  }
}

async function handleResponse(response: Response, label: string): Promise<string> {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${label} error (${response.status}): ${body || response.statusText}`);
  }

  let data: { text?: string };
  try {
    data = await response.json();
  } catch {
    throw new Error(`${label} returned an unexpected (non-JSON) response.`);
  }
  return (data.text ?? '').trim();
}
