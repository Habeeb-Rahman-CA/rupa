import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * Per-user AI provider settings (`app_settings`).
 *
 * One row per user (`owner_id` is UNIQUE — migrations/0016). The
 * `ai_api_key` column holds the **client-side ciphertext** produced by
 * `AiKeyVaultService` (`enc:v1:…`, device-bound AES-GCM) or, for legacy
 * rows, plain text; the server treats it as opaque text and never logs or
 * decrypts it. `ai_base_url`, `ai_model` and `ai_headers` are the
 * provider-agnostic configuration read by the bill scanner; NULL means
 * "use the built-in default".
 */
@Entity('app_settings')
export class AppSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  owner_id: string;

  /** Opaque client ciphertext (`enc:v1:…`) or legacy plain text. */
  @Column({ type: 'text', nullable: true })
  ai_api_key: string | null;

  /** OpenAI-compatible base URL, e.g. 'https://api.openai.com/v1'. */
  @Column({ type: 'text', nullable: true })
  ai_base_url: string | null;

  /** Provider model id, e.g. 'gemini-3.8-flash'. */
  @Column({ type: 'text', nullable: true })
  ai_model: string | null;

  /** Extra request headers merged over the defaults (jsonb). */
  @Column({ type: 'jsonb', nullable: true })
  ai_headers: Record<string, string> | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updated_at: Date;
}
