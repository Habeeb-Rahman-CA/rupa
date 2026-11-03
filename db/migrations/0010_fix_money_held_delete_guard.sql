-- =============================================================================
-- Migration 0010: Fix money-held deletion balance guard
--
-- The original trigger excluded the row being deleted from its totals and then
-- subtracted that row again. This incorrectly rejected valid receipt deletions.
-- =============================================================================

create or replace function public.prevent_over_returned_money()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_held_person_id uuid;
  target_direction text;
  target_amount numeric;
  received_total numeric;
  returned_total numeric;
begin
  if tg_op = 'DELETE' then
    target_held_person_id := old.held_person_id;
    target_direction := old.direction;
    target_amount := old.amount;
  else
    target_held_person_id := new.held_person_id;
    target_direction := new.direction;
    target_amount := new.amount;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_held_person_id::text, 0));

  select
    coalesce(sum(case when direction = 'received' then amount else 0 end), 0),
    coalesce(sum(case when direction = 'returned' then amount else 0 end), 0)
  into received_total, returned_total
  from public.money_held_transactions
  where held_person_id = target_held_person_id
    and id <> coalesce(new.id, old.id);

  -- The current row is already excluded above. Only inserts and updates need
  -- the incoming value added to the remaining totals.
  if tg_op <> 'DELETE' then
    if target_direction = 'received' then
      received_total := received_total + target_amount;
    else
      returned_total := returned_total + target_amount;
    end if;
  end if;

  if returned_total > received_total then
    raise exception 'Returned amount cannot exceed money received for this person';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
