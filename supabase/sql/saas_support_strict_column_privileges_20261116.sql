-- Supabase default table privileges can grant broad UPDATE to authenticated.
-- Force least privilege even when default grants exist on freshly created tables.
revoke all on public.saas_support_tickets from authenticated;
grant select,insert on public.saas_support_tickets to authenticated;
grant update(status,updated_at) on public.saas_support_tickets to authenticated;
-- service_role and the internal trigger origin remain unaffected.
