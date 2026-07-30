-- ============================================================
-- Per-company job number prefix: the text before the number is
-- configurable (JOB- by default); the sequential number itself
-- stays locked and non-editable. Existing jobs keep their numbers.
-- ============================================================

alter table companies
  add column job_prefix text not null default 'JOB-';

create or replace function public.set_job_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_seq integer;
  v_prefix text;
begin
  if new.job_number is null then
    update companies set job_seq = job_seq + 1 where id = new.company_id
      returning job_seq, job_prefix into next_seq, v_prefix;
    new.job_number := v_prefix || lpad(next_seq::text, 4, '0');
  end if;
  return new;
end;
$$;
