-- Sends an email notification whenever a new booking is inserted.
-- Replace <project-ref> and <anon-key> before running.

create extension if not exists pg_net;

create or replace function public.notify_admin_on_booking()
returns trigger as $$
begin
  perform net.http_post(
    url := 'https://nxolazivbugqiglgxvmf.functions.supabase.co/notify-admin',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('record', row_to_json(new))
  );
  return new;
end;
$$ language plpgsql;

drop trigger if exists bookings_notify_admin on public.bookings;
create trigger bookings_notify_admin
after insert on public.bookings
for each row execute function public.notify_admin_on_booking();
