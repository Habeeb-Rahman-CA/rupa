import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRefreshTokensTable1732000000001 implements MigrationInterface {
  name = 'CreateRefreshTokensTable1732000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tokenHash" text NOT NULL,
        "revokedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "userId" uuid,
        CONSTRAINT "PK_8e7d4f2a9b1c3d4e5f6a7b8c9" PRIMARY KEY ("id"),
        CONSTRAINT "FK_8e7d4f2a9b1c3d4e5f6a7b8c9_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_refresh_tokens_token_hash_active"
      ON "refresh_tokens" ("tokenHash")
      WHERE "revokedAt" IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_refresh_tokens_token_hash_active"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
  }
}
