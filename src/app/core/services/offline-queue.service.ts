import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';

export type OfflineActionType = 'create' | 'delete' | 'update';

export interface OfflineAction {
  id: string;
  type: OfflineActionType;
  table: string;
  payload: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
}

const MAX_RETRIES = 5;

function queueKey(userId: string): string {
  return `rupa:${userId}:offline_queue`;
}

function readQueue(userId: string): OfflineAction[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(queueKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineAction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(userId: string, queue: OfflineAction[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(queueKey(userId), JSON.stringify(queue));
  } catch {
    // Storage unavailable — queue will be lost on refresh, acceptable.
  }
}

@Injectable({ providedIn: 'root' })
export class OfflineQueueService {
  private readonly auth = inject(AuthService);

  private readonly _queue = signal<OfflineAction[]>([]);
  private readonly _isProcessing = signal(false);
  private readonly _isOnline = signal(typeof navigator !== 'undefined' ? navigator.onLine : true);

  readonly queue = this._queue.asReadonly();
  readonly isProcessing = this._isProcessing.asReadonly();
  readonly isOnline = this._isOnline.asReadonly();
  readonly pendingCount = computed(() => this._queue().length);

  private handlers = new Map<string, (action: OfflineAction) => Promise<void>>();

  constructor() {
    // Load queue on auth state change.
    effect(() => {
      const userId = this.auth.user()?.id;
      if (userId) {
        this._queue.set(readQueue(userId));
      } else {
        this._queue.set([]);
      }
    });

    // Online/offline tracking.
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this._isOnline.set(true);
        void this.processQueue();
      });
      window.addEventListener('offline', () => {
        this._isOnline.set(false);
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this._isOnline()) {
          void this.processQueue();
        }
      });
    }
  }

  /** Register a handler for a specific table. Called by feature services at init. */
  registerHandler(table: string, handler: (action: OfflineAction) => Promise<void>): void {
    this.handlers.set(table, handler);
  }

  /** Enqueue an action for later sync when back online. */
  enqueue(action: Omit<OfflineAction, 'id' | 'timestamp' | 'retryCount'>): void {
    const userId = this.auth.user()?.id;
    if (!userId) return;

    const entry: OfflineAction = {
      ...action,
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      retryCount: 0,
    };

    this._queue.update((q) => {
      const next = [...q, entry];
      writeQueue(userId, next);
      return next;
    });
  }

  /** Remove an action from the queue once it has synced successfully. */
  private removeAction(actionId: string): void {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    this._queue.update((q) => {
      const next = q.filter((a) => a.id !== actionId);
      writeQueue(userId, next);
      return next;
    });
  }

  /** Process all queued actions. Safe to call multiple times (guarded by isProcessing). */
  async processQueue(): Promise<void> {
    if (this._isProcessing()) return;
    if (!this._isOnline()) return;
    const userId = this.auth.user()?.id;
    if (!userId) return;

    this._isProcessing.set(true);
    try {
      const queue = [...this._queue()];
      for (const action of queue) {
        // Re-read queue each iteration — another tab may have processed it.
        const current = this._queue().find((a) => a.id === action.id);
        if (!current) continue;

        if (current.retryCount >= MAX_RETRIES) {
          console.error(`Offline action ${current.id} exceeded max retries, dropping.`);
          this.removeAction(current.id);
          continue;
        }

        try {
          const handler = this.handlers.get(current.table);
          if (!handler) {
            throw new Error(`No handler registered for table "${current.table}".`);
          }
          await handler(current);
          this.removeAction(current.id);
        } catch (err) {
          // Increment retry and keep in queue.
          this._queue.update((q) =>
            q.map((a) => (a.id === current.id ? { ...a, retryCount: a.retryCount + 1 } : a)),
          );
          writeQueue(userId, this._queue());
          console.error(`Offline action ${current.id} retry ${current.retryCount + 1}:`, err);
        }
      }
    } finally {
      this._isProcessing.set(false);
    }
  }
}
