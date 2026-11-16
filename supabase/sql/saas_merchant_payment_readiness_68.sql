-- Fase II: controle de prontidão de pagamentos das lojas. NÃO integra nem ativa cobranças.
-- Tokens OAuth, refresh tokens e segredos nunca são armazenados nesta tabela.
-- Somente o backend confiável (service_role) pode gerenciar estados após validar o provedor.
create table if not exists public.saas_merchant_payment_connections (
  tenant_id uuid not null references public.saas_tenants(id) on delete cascade,
  provider text not null default 'mercado_pago',
  status text not null default 'disconnected',
  provider_account_label text,
  connected_at timestamptz,
  last_verified_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint saas_merchant_payments_pk primary key (tenant_id,provider),
  constraint saas_merchant_payments_provider_check check (provider in ('mercado_pago')),
  constraint saas_merchant_payments_status_check check (status in ('disconnected','pending','connected','revoked','error')),
  constraint saas_merchant_payments_label_length check (provider_account_label is null or char_length(provider_account_label) <= 120),
  constraint saas_merchant_payments_connected_check check (status <> 'connected' or (connected_at is not null and last_verified_at is not null))
);
alter table public.saas_merchant_payment_connections enable row level security;
revoke all on public.saas_merchant_payment_connections from public, anon, authenticated;
grant select on public.saas_merchant_payment_connections to authenticated;
drop policy if exists saas_merchant_payment_owner_read on public.saas_merchant_payment_connections;
create policy saas_merchant_payment_owner_read
  on public.saas_merchant_payment_connections
  for select to authenticated
  using (public.saas_has_tenant_role(tenant_id,ARRAY['owner'::public.saas_member_role]));
-- Deliberately NO insert/update/delete policies for users.
-- A "connected" state cannot be asserted from a browser. It must be set
-- by a future server-only OAuth callback after provider token verification.
