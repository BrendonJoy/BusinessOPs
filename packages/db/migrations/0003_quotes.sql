-- Quoting: keep quotes.total in sync with its line items, and expose the public
-- share-link flow through narrow security-definer RPCs rather than any anon
-- grant on the quotes/quote_line_items tables themselves.

create function public.update_quote_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_quote_id uuid;
begin
  affected_quote_id := coalesce(new.quote_id, old.quote_id);

  update quotes
    set total = coalesce((select sum(line_total) from quote_line_items where quote_id = affected_quote_id), 0)
    where id = affected_quote_id;

  return null;
end;
$$;

create trigger quote_line_items_update_total
  after insert or update or delete on quote_line_items
  for each row execute function public.update_quote_total();

-- Returns the quote + line items + minimal job/customer context for a given
-- share token, or null if no quote has that token. security definer bypasses
-- RLS internally; anon only ever gets EXECUTE on this function, never SELECT
-- on the underlying tables, so a token is required to see anything at all.
create function public.get_quote_by_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'quote', to_jsonb(q) - 'share_token',
    'line_items', coalesce(
      (select jsonb_agg(to_jsonb(qli) order by qli.created_at) from quote_line_items qli where qli.quote_id = q.id),
      '[]'::jsonb
    ),
    'job', jsonb_build_object('job_number', j.job_number, 'address_line', j.address_line),
    'customer', jsonb_build_object('name', c.name)
  )
  into result
  from quotes q
  join jobs j on j.id = q.job_id
  left join customers c on c.id = j.customer_id
  where q.share_token = p_token;

  return result;
end;
$$;

-- Accepts/declines a quote by token. Only succeeds from status 'sent', so it
-- can't be replayed after the customer has already responded, and can't be
-- used to jump a quote straight from 'draft'.
create function public.respond_to_quote(p_token text, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated quotes;
begin
  if p_status not in ('accepted', 'declined') then
    return jsonb_build_object('error', 'invalid_status');
  end if;

  update quotes
    set status = p_status::quote_status, responded_at = now()
    where share_token = p_token and status = 'sent'
    returning * into updated;

  if updated.id is null then
    return jsonb_build_object('error', 'not_available');
  end if;

  return jsonb_build_object('quote', to_jsonb(updated) - 'share_token');
end;
$$;

grant usage on schema public to anon;
grant execute on function public.get_quote_by_token(text) to anon, authenticated;
grant execute on function public.respond_to_quote(text, text) to anon, authenticated;
