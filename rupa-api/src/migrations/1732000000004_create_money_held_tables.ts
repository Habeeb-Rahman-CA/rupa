import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMoneyHeldTables1732000000004 implements MigrationInterface {
  name = 'CreateMoneyHeldTables1732000000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      create table if not exists public.money_held_people (
        id          uuid primary key default gen_random_uuid(),
        owner_id    uuid not null,
        person_id   uuid not null,
        created_at  timestamptz not null default now(),
        unique (owner_id, person_id)
      )
    `);
    await queryRunner.query(`
      create index if not exists money_held_people_owner_idx
        on public.money_held_people (owner_id)
    `);
    await queryRunner.query(`
      create index if not exists money_held_people_person_idx
        on public.money_held_people (person_id)
    `);

    await queryRunner.query(`
      create table if not exists public.money_held_transactions (
        id             uuid primary key default gen_random_uuid(),
        owner_id       uuid not null,
        held_person_id uuid not null,
        direction      varchar(10) not null check (direction in ('received', 'returned')),
        amount         numeric(12, 2) not null,
        occurred_on    date not null,
        payment_mode   varchar(10) not null check (payment_mode in ('cash', 'bank')),
        bank_account_id uuid,
        notes          text,
        created_at     timestamptz not null default now()
      )
    `);
    await queryRunner.query(`
      create index if not exists money_held_transactions_owner_idx
        on public.money_held_transactions (owner_id)
    `);
    await queryRunner.query(`
      create index if not exists money_held_transactions_held_person_idx
        on public.money_held_transactions (held_person_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop index if exists public.money_held_transactions_held_person_idx`);
    await queryRunner.query(`drop index if exists public.money_held_transactions_owner_idx`);
    await queryRunner.query(`drop table if exists public.money_held_transactions`);
    await queryRunner.query(`drop index if exists public.money_held_people_person_idx`);
    await queryRunner.query(`drop index if exists public.money_held_people_owner_idx`);
    await queryRunner.query(`drop table if exists public.money_held_people`);
  }
}
