import { Injectable } from '@angular/core';

export interface AudioCaptureResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

/**
 * Captures microphone audio in the browser via MediaRecorder.
 *
 * Recordings are kept as an in-memory Blob — nothing is persisted to disk or
 * sent anywhere until the caller explicitly passes the blob to a transcription
 * provider. Microphone permission is requested on first use; a denial or
 * unsupported browser surfaces a clear error so the caller can fall back to
 * manual entry.
 */
@Injectable({ providedIn: 'root' })
export class AudioCaptureService {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startTime = 0;

  /** True when MediaRecorder and getUserMedia are available. */
  isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof MediaRecorder !== 'undefined'
    );
  }

  /** True while a recording is in progress. */
  isRecording(): boolean {
    return this.recorder !== null && this.recorder.state !== 'inactive';
  }

  /**
   * Starts recording microphone audio. Requests permission on first use.
   * Rejects with a descriptive error if the mic is unavailable or denied.
   */
  async startRecording(): Promise<void> {
    if (this.isRecording()) return;

    if (!this.isSupported()) {
      throw new Error(
        'Your browser does not support microphone recording. Please enter the details manually.',
      );
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Microphone access was denied or unavailable (${message}). Enter the details manually.`,
      );
    }

    this.releaseStream(); // drop any stale stream from a previous recording
    this.chunks = [];
    this.stream = stream;

    // Pick a container the current browser actually supports: Chromium records
    // webm, Safari only supports mp4 — hardcoding audio/webm throws there.
    const mimeType = pickSupportedMimeType();
    try {
      this.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      this.releaseStream();
      throw new Error(
        'Audio recording could not be started in this browser. Enter the details manually.',
      );
    }

    this.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.chunks.push(event.data);
    };

    this.recorder.onstop = () => this.releaseStream();

    this.recorder.onerror = () => {
      this.recorder = null;
      this.chunks = [];
      this.releaseStream();
    };

    this.startTime = performance.now();
    this.recorder.start(200); // fire dataavailable every 200ms
  }

  /**
   * Stops recording and returns the captured audio Blob.
   * Rejects if no recording is in progress.
   */
  async stopRecording(): Promise<AudioCaptureResult> {
    if (!this.isRecording()) {
      throw new Error('No recording in progress.');
    }

    return new Promise<AudioCaptureResult>((resolve, reject) => {
      const recorder = this.recorder!;
      // stopRecording replaces the onstop handler installed in startRecording,
      // so the mic stream must be released here too — otherwise the browser's
      // recording indicator stays on for the rest of the session.
      const mimeType = recorder.mimeType || pickSupportedMimeType() || 'audio/webm';
      recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: mimeType });
        const durationMs = performance.now() - this.startTime;
        this.releaseStream();
        this.recorder = null;
        this.chunks = [];
        resolve({
          blob,
          mimeType: blob.type || mimeType,
          durationMs,
        });
      };
      recorder.onerror = () => {
        this.releaseStream();
        this.recorder = null;
        this.chunks = [];
        reject(new Error('Failed to stop recording.'));
      };
      recorder.stop();
    });
  }

  /** Cancels an in-progress recording without returning audio. */
  cancelRecording(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop(); // fires onstop → releaseStream()
    }
    this.recorder = null;
    this.chunks = [];
    this.releaseStream();
  }

  /** Stops every mic track so the browser's recording indicator turns off. */
  private releaseStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}

/**
 * First container MediaRecorder supports, preferring webm (Chromium) then
 * mp4 (Safari) then ogg (Firefox). Undefined when nothing matches, in which
 * case the recorder falls back to its browser default.
 */
function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  const candidates = ['audio/webm', 'audio/mp4', 'audio/ogg'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

/** File extension for an audio mime type, e.g. 'audio/webm' → 'webm'. */
export function audioExtension(mimeType: string): string {
  const subtype = (mimeType || '').split(';')[0].split('/')[1]?.toLowerCase() ?? '';
  const aliases: Record<string, string> = {
    'x-m4a': 'm4a',
    'x-wav': 'wav',
    'x-matroska': 'webm',
    mpeg: 'mp3',
  };
  return aliases[subtype] || subtype || 'webm';
}
