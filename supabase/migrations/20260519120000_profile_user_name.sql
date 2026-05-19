-- Persist display name from signup metadata (user_name or full_name).

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
begin
  display_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'user_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    null
  );

  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, display_name)
  on conflict (id) do update
    set
      email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name),
      updated_at = now();

  insert into public.categories (user_id, name, is_expense)
  values
    (new.id, 'Food', true),
    (new.id, 'Transport', true),
    (new.id, 'Rent', true),
    (new.id, 'Utilities', true),
    (new.id, 'Shopping', true),
    (new.id, 'Health', true),
    (new.id, 'Entertainment', true),
    (new.id, 'Other', true)
  on conflict (user_id, name) do nothing;

  return new;
end;
$$;

commit;
