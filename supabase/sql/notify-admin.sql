-- Sends booking emails directly from Postgres with pg_net.
-- New bookings notify admin and customer. Status changes notify the customer.

create extension if not exists pg_net;

create table if not exists public.email_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.email_settings (key, value)
values
  ('resend_api_key', 're_gdVtVYWb_KewkscE8hCmg7TzkuRbopxwV'),
  ('email_from', 'House of Dolphins <crabs4963@gmail.com>'),
  ('admin_email', 'danieloluwanifemi2002@gmail.com'),
  ('admin_link', 'https://house-of-dolphins.vercel.app/admin')
on conflict (key) do nothing;

-- After running this file, set these to your real Resend values:
-- update public.email_settings set value = 're_xxx' where key = 'resend_api_key';
-- update public.email_settings set value = 'House of Dolphins <bookings@your-verified-domain.com>' where key = 'email_from';
-- update public.email_settings set value = 'admin@example.com' where key = 'admin_email';

create or replace function public.notify_admin_on_booking()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  v_resend_api_key text;
  v_email_from text;
  v_admin_email text;
  v_admin_link text;
  v_customer_email text;
  v_customer_name text;
  v_customer_phone text;
  v_court text;
  v_plan text;
  v_start_date text;
  v_end_date text;
  v_start_time text;
  v_total_amount text;
  v_date_label text;
  v_status_label text;
  v_customer_html text;
begin
  select value into v_resend_api_key from public.email_settings where key = 'resend_api_key';
  select value into v_email_from from public.email_settings where key = 'email_from';
  select value into v_admin_email from public.email_settings where key = 'admin_email';
  select value into v_admin_link from public.email_settings where key = 'admin_link';

  v_resend_api_key := nullif(trim(coalesce(v_resend_api_key, '')), '');
  v_email_from := nullif(trim(coalesce(v_email_from, '')), '');
  v_admin_email := nullif(trim(coalesce(v_admin_email, '')), '');
  v_admin_link := coalesce(nullif(trim(coalesce(v_admin_link, '')), ''), 'https://house-of-dolphins.vercel.app/admin');

  if v_resend_api_key is null or v_email_from is null or v_admin_email is null then
    raise warning 'Booking notification skipped: missing resend_api_key, email_from, or admin_email in public.email_settings';
    return new;
  end if;

  v_customer_email := lower(trim(coalesce(new.customer_email::text, '')));
  v_customer_name := coalesce(nullif(trim(coalesce(new.customer_name::text, '')), ''), 'Customer');
  v_customer_phone := coalesce(nullif(trim(coalesce(new.customer_phone::text, '')), ''), 'N/A');
  v_court := coalesce(nullif(trim(coalesce(new.court_id::text, '')), ''), 'N/A');
  v_plan := coalesce(nullif(trim(coalesce(new.plan::text, '')), ''), 'N/A');
  v_start_date := coalesce(new.start_date::text, 'N/A');
  v_end_date := coalesce(new.end_date::text, '');
  v_start_time := coalesce(nullif(trim(coalesce(new.start_time::text, '')), ''), 'N/A');
  v_total_amount := 'NGN ' || coalesce(new.total_amount::text, '0');

  v_date_label :=
    case
      when v_plan = 'Hourly' and v_start_time <> 'N/A' then v_start_date || ' at ' || v_start_time
      when v_end_date <> '' and v_end_date <> v_start_date then v_start_date || ' to ' || v_end_date
      else v_start_date
    end;

  if tg_op = 'INSERT' then
    begin
      perform net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_resend_api_key,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'from', v_email_from,
          'to', jsonb_build_array(v_admin_email),
          'subject', 'New booking from ' || v_customer_name,
          'html',
            '<html><body style="font-family:Arial,sans-serif;">' ||
            '<h2>New Booking Received</h2>' ||
            '<p><strong>Customer:</strong> ' || v_customer_name || '</p>' ||
            '<p><strong>Email:</strong> ' || coalesce(nullif(v_customer_email, ''), 'N/A') || '</p>' ||
            '<p><strong>Phone:</strong> ' || v_customer_phone || '</p>' ||
            '<p><strong>Court:</strong> ' || v_court || '</p>' ||
            '<p><strong>Plan:</strong> ' || v_plan || '</p>' ||
            '<p><strong>Date:</strong> ' || v_date_label || '</p>' ||
            '<p><strong>Amount:</strong> ' || v_total_amount || '</p>' ||
            '<p><a href="' || v_admin_link || '">View in Admin</a></p>' ||
            '</body></html>'
        )
      );
    exception when others then
      raise warning 'Admin booking email failed: %', sqlerrm;
    end;

    if v_customer_email ~ '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$' then
      begin
        perform net.http_post(
          url := 'https://api.resend.com/emails',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || v_resend_api_key,
            'Content-Type', 'application/json'
          ),
          body := jsonb_build_object(
            'from', v_email_from,
            'to', jsonb_build_array(v_customer_email),
            'subject', 'Your House of Dolphins booking was received',
            'html',
              '<html><body style="font-family:Arial,sans-serif;">' ||
              '<h2>Booking Received</h2>' ||
              '<p>Hi ' || v_customer_name || ',</p>' ||
              '<p>Your booking has been received and is pending approval.</p>' ||
              '<p><strong>Court:</strong> ' || v_court || '</p>' ||
              '<p><strong>Plan:</strong> ' || v_plan || '</p>' ||
              '<p><strong>Date:</strong> ' || v_date_label || '</p>' ||
              '<p><strong>Total:</strong> ' || v_total_amount || '</p>' ||
              '<p>We will contact you shortly with confirmation.</p>' ||
              '<p>Best regards,<br/>House of Dolphins Team</p>' ||
              '</body></html>'
          )
        );
      exception when others then
        raise warning 'Customer booking email failed: %', sqlerrm;
      end;
    end if;
  end if;

  if tg_op = 'UPDATE'
    and new.status is distinct from old.status
    and new.status in ('confirmed', 'rejected')
    and v_customer_email ~ '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'
  then
    v_status_label := case when new.status = 'confirmed' then 'approved' else 'rejected' end;
    v_customer_html :=
      '<html><body style="font-family:Arial,sans-serif;">' ||
      '<h2>Booking ' || initcap(v_status_label) || '</h2>' ||
      '<p>Hi ' || v_customer_name || ',</p>' ||
      '<p>Your booking has been <strong>' || v_status_label || '</strong>.</p>' ||
      '<p><strong>Court:</strong> ' || v_court || '</p>' ||
      '<p><strong>Plan:</strong> ' || v_plan || '</p>' ||
      '<p><strong>Date:</strong> ' || v_date_label || '</p>' ||
      '<p><strong>Total:</strong> ' || v_total_amount || '</p>' ||
      '<p>Best regards,<br/>House of Dolphins Team</p>' ||
      '</body></html>';

    begin
      perform net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_resend_api_key,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'from', v_email_from,
          'to', jsonb_build_array(v_customer_email),
          'subject', 'Your House of Dolphins booking was ' || v_status_label,
          'html', v_customer_html
        )
      );
    exception when others then
      raise warning 'Customer status email failed: %', sqlerrm;
    end;
  end if;

  return new;
exception when others then
  raise warning 'Booking notification trigger failed: %', sqlerrm;
  return new;
end;
$$;

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

alter table public.bookings enable trigger bookings_notify_admin;
alter table public.bookings enable trigger bookings_notify_status;
