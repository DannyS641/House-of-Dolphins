-- Emergency reset: disables booking email triggers so bookings and admin status
-- changes keep working while email delivery is being configured.

drop trigger if exists bookings_notify_admin on public.bookings;
drop trigger if exists bookings_notify_status on public.bookings;
drop function if exists public.notify_admin_on_booking();
