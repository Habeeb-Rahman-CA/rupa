-- =============================================================================
-- Migration 0020: Owner-aware foreign key RLS policies
--
-- Existing RLS policies only check that the immediate row belongs to the
-- authenticated owner. They do not verify that rows referenced by foreign keys
-- (person_id, category_id, bank_account_id, payment_account_id) also belong to
-- the same owner. This allows cross-user data leakage: User A could create a
-- debt referencing User B's person, or a transaction referencing User B's
-- category or bank account.
--
-- This migration updates the affected RLS policies to require that referenced
-- rows are owned by the same authenticated user.
-- =============================================================================

-- --- debts: person_id must reference a people row owned by the same user -----

drop policy if exists debts_owner_all on public.debts;
create policy debts_owner_all on public.debts
  for all
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.people p
      where p.id = debts.person_id and p.owner_id = auth.uid()
    )
  )
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.people p
      where p.id = debts.person_id and p.owner_id = auth.uid()
    )
  );

-- --- transactions: category_id and bank_account_id must be owner-scoped -------

drop policy if exists transactions_owner_all on public.transactions;
create policy transactions_owner_all on public.transactions
  for all
  using (
    owner_id = auth.uid()
    and (category_id is null or exists (
      select 1 from public.categories c
      where c.id = transactions.category_id and c.owner_id = auth.uid()
    ))
    and (bank_account_id is null or exists (
      select 1 from public.bank_accounts ba
      where ba.id = transactions.bank_account_id and ba.owner_id = auth.uid()
    ))
  )
  with check (
    owner_id = auth.uid()
    and (category_id is null or exists (
      select 1 from public.categories c
      where c.id = transactions.category_id and c.owner_id = auth.uid()
    ))
    and (bank_account_id is null or exists (
      select 1 from public.bank_accounts ba
      where ba.id = transactions.bank_account_id and ba.owner_id = auth.uid()
    ))
  );

-- --- subscriptions: payment_account_id must be owner-scoped ------------------

drop policy if exists subscriptions_owner_all on public.subscriptions;
create policy subscriptions_owner_all on public.subscriptions
  for all
  using (
    owner_id = auth.uid()
    and (payment_account_id is null or exists (
      select 1 from public.bank_accounts ba
      where ba.id = subscriptions.payment_account_id and ba.owner_id = auth.uid()
    ))
  )
  with check (
    owner_id = auth.uid()
    and (payment_account_id is null or exists (
      select 1 from public.bank_accounts ba
      where ba.id = subscriptions.payment_account_id and ba.owner_id = auth.uid()
    ))
  );

-- --- wallet_transactions: bank_account_id and category_id must be owner-scoped

drop policy if exists wallet_transactions_owner_all on public.wallet_transactions;
create policy wallet_transactions_owner_all on public.wallet_transactions
  for all
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.wallets w
      where w.id = wallet_transactions.wallet_id and w.owner_id = auth.uid()
    )
    and (bank_account_id is null or exists (
      select 1 from public.bank_accounts ba
      where ba.id = wallet_transactions.bank_account_id and ba.owner_id = auth.uid()
    ))
    and (category_id is null or exists (
      select 1 from public.categories c
      where c.id = wallet_transactions.category_id and c.owner_id = auth.uid()
    ))
  )
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.wallets w
      where w.id = wallet_transactions.wallet_id and w.owner_id = auth.uid()
    )
    and (bank_account_id is null or exists (
      select 1 from public.bank_accounts ba
      where ba.id = wallet_transactions.bank_account_id and ba.owner_id = auth.uid()
    ))
    and (category_id is null or exists (
      select 1 from public.categories c
      where c.id = wallet_transactions.category_id and c.owner_id = auth.uid()
    ))
  );

-- --- interest_entries: bank_account_id must be owner-scoped ------------------

drop policy if exists interest_entries_owner_all on public.interest_entries;
create policy interest_entries_owner_all on public.interest_entries
  for all
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.bank_accounts ba
      where ba.id = interest_entries.bank_account_id and ba.owner_id = auth.uid()
    )
  )
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.bank_accounts ba
      where ba.id = interest_entries.bank_account_id and ba.owner_id = auth.uid()
    )
  );
