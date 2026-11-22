import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePushTables1732000000003 implements MigrationInterface {
  name = 'CreatePushTables1732000000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create table if not exists public.push_subscriptions (
        id          uuid primary key default gen_random_uuid(),
        owner_id    uuid not null,
        endpoint    text not null,
        p256dh      text not null,
        auth        text not null,
        user_agent  text,
        created_at  timestamptz not null default now(),
        updated_at  timestamptz not null default now()
      )
    `);
    await queryRunner.query(`
      create unique index if not exists push_subscriptions_owner_endpoint_idx
        on public.push_subscriptions (owner_id, endpoint)
    `);
    await queryRunner.query(`
      create index if not exists push_subscriptions_owner_idx
        on public.push_subscriptions (owner_id)
    `);

    await queryRunner.query(`
      create table if not exists public.push_preferences (
        owner_id    uuid not null,
        category    text not null check (category in ('renewals', 'low_balance', 'budget', 'daily_expense', 'daily_confirm')),
        enabled     boolean not null default true,
        updated_at  timestamptz not null default now(),
        primary key (owner_id, category)
      )
    `);

    await queryRunner.query(`
      create table if not exists public.push_notification_log (
        id          uuid primary key default gen_random_uuid(),
        owner_id    uuid not null,
        category    text not null check (category in ('renewals', 'low_balance', 'budget', 'daily_expense', 'daily_confirm')),
        ref         text not null,
        created_at  timestamptz not null default now(),
        unique (owner_id, category, ref)
      )
    `);
    await queryRunner.query(`
      create index if not exists push_notification_log_created_idx
        on public.push_notification_log (created_at)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop index if exists public.push_notification_log_created_idx`);
    await queryRunner.query(`drop table if exists public.push_notification_log`);
    await queryRunner.query(`drop table if exists public.push_preferences`);
    await queryRunner.query(`drop index if exists public.push_subscriptions_owner_endpoint_idx`);
    await queryRunner.query(`drop index if exists public.push_subscriptions_owner_idx`);
    await queryRunner.query(`drop table if exists public.push_subscriptions`);
  }
}
