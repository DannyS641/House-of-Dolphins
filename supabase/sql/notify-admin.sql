-- Sends an email notification whenever a new booking is inserted.
-- Replace <project-ref> and <anon-key> before running.

create extension if not exists pg_net;

create or replace function public.notify_admin_on_booking()
returns trigger as $$
begin
  perform net.http_post(
    url := 'https://nxolazivbugqiglgxvmf.functions.supabase.co/notify-admin',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54b2xheml2YnVncWlnbGd4dm1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDU2MjQsImV4cCI6MjA4NDY4MTYyNH0.ap6D8cjxDDl4w3WWLP-WvfILc2JwZxFa8rD_JUdrqS8',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54b2xheml2YnVncWlnbGd4dm1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDU2MjQsImV4cCI6MjA4NDY4MTYyNH0.ap6D8cjxDDl4w3WWLP-WvfILc2JwZxFa8rD_JUdrqS8'
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
