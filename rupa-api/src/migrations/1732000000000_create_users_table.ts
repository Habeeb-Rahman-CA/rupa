import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersTable1732000000000 implements MigrationInterface {
  name = 'CreateUsersTable1732000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" text NOT NULL,
        "passwordHash" text NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_7ff5686b1a1a7f7c5f5e5f5e5" UNIQUE ("email"),
        CONSTRAINT "PK_a3ffb1c0c8416b9fc4f7f7f7f" PRIMARY KEY ("id")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "pgcrypto"`);
  }
}
