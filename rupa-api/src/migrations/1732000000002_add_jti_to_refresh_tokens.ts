import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJtiToRefreshTokens1732000000002 implements MigrationInterface {
  name = 'AddJtiToRefreshTokens1732000000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD COLUMN "jti" varchar(255) NOT NULL DEFAULT gen_random_uuid()::text`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_refresh_tokens_jti" ON "refresh_tokens" ("jti")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_refresh_tokens_jti"`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN "jti"`);
  }
}
