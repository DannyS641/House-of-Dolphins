-- Sends email notifications when a booking is created
-- and when its status changes.

create extension if not exists pg_net;

create or replace function public.notify_admin_on_booking()
returns trigger as $$
begin
  perform net.http_post(
    url := 'https://nxolazivbugqiglgxvmf.functions.supabase.co/notify-admin',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'type', tg_op,
      'record', row_to_json(new),
      'old_record', case when tg_op = 'UPDATE' then row_to_json(old) else null end
    )
  );
  return new;
end;
$$ language plpgsql;

drop trigger if exists bookings_notify_admin on public.bookings;
drop trigger if exists bookings_notify_status on public.bookings;

create trigger bookings_notify_admin
after insert on public.bookings
for each row execute function public.notify_admin_on_booking();

create trigger bookings_notify_status
after update of status on public.bookings
for each row
when (old.status is distinct from new.status)
execute function public.notify_admin_on_booking();
