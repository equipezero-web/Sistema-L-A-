import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.78.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Content-Type": "application/json",
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function configuredKey(primary: string, collection: string) {
  const direct = Deno.env.get(primary);
  if (direct) return direct;
  try {
    const parsed = JSON.parse(Deno.env.get(collection) || "{}");
    return typeof parsed.default === "string" ? parsed.default : "";
  } catch {
    return "";
  }
}

function trustedCheckoutUrl(candidate: unknown) {
  if (typeof candidate !== "string") return "";
  try {
    const target = new URL(candidate);
    if (target.protocol !== "https:") return "";
    const hostname = target.hostname.toLowerCase();
    if (hostname !== "mercadopago.com" &&
        hostname !== "www.mercadopago.com" &&
        hostname !== "mercadopago.com.br" &&
        hostname !== "www.mercadopago.com.br") return "";
    return target.href;
  } catch {
    return "";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Método não permitido." }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return reply({ error: "Sessão obrigatória." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishableKey = configuredKey("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS");
    if (!supabaseUrl || !publishableKey) return reply({ error: "Configuração de autenticação indisponível." }, 503);

    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userResult, error: userError } = await userClient.auth.getUser();
    const user = userResult?.user;
    if (userError || !user) return reply({ error: "Sessão inválida." }, 401);

    const body = await req.json().catch(() => ({}));
    const tenantId = String(body?.tenant_id || "").trim();
    if (!uuidPattern.test(tenantId)) return reply({ error: "Empresa inválida." }, 400);

    const { data: member, error: memberError } = await userClient.from("saas_members")
      .select("role,status")
      .eq("tenant_id", tenantId).eq("user_id", user.id).eq("status", "active").maybeSingle();
    if (memberError || !member || member.role !== "owner") {
      return reply({ error: "Somente o proprietário pode contratar o plano." }, 403);
    }
    const { data: tenant, error: tenantError } = await userClient.from("saas_tenants")
      .select("active").eq("id", tenantId).maybeSingle();
    if (tenantError || !tenant?.active) return reply({ error: "Empresa indisponível." }, 403);

    const enabled = Deno.env.get("MP_CHECKOUT_ENABLED") === "true";
    if (body?.action === "status") return reply({ checkout_enabled: enabled });
    if (body?.action && body.action !== "checkout") return reply({ error: "Operação inválida." }, 400);
    if (!enabled) return reply({
      error: "Assinaturas temporariamente indisponíveis. Nenhuma cobrança foi iniciada.",
      code: "CHECKOUT_DISABLED",
    }, 503);

    const { data: plan, error: planError } = await userClient.from("saas_plans")
      .select("id,code,name,price_monthly")
      .eq("code", "royal-30").eq("active", true).single();
    if (planError || !plan || Number(plan.price_monthly) !== 30) {
      return reply({ error: "Plano Royal 30 indisponível." }, 409);
    }
    const accessToken = Deno.env.get("MP_ACCESS_TOKEN");
    const webhookSecret = Deno.env.get("MP_WEBHOOK_SECRET");
    const serverKey = configuredKey("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS");
    if (!accessToken || !webhookSecret || !serverKey) {
      return reply({ error: "Integração de pagamentos não configurada." }, 503);
    }
    if (!user.email || !user.email_confirmed_at) {
      return reply({ error: "Confirme seu e-mail antes de contratar." }, 409);
    }

    const serverClient = createClient(supabaseUrl, serverKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: prior, error: priorError } = await serverClient.from("saas_subscriptions")
      .select("status,provider_subscription_id")
      .eq("tenant_id", tenantId).maybeSingle();
    if (priorError) throw priorError;
    if (prior?.status === "active") {
      return reply({ error: "A empresa já possui uma assinatura ativa." }, 409);
    }
    if (prior?.provider_subscription_id && prior.status !== "cancelled") {
      return reply({
        error: "Já existe uma assinatura cadastrada. Consulte o status antes de tentar novamente.",
        code: "SUBSCRIPTION_EXISTS",
      }, 409);
    }

    // This endpoint must only be enabled after the webhook and MP credentials are verified.
    // Its external_reference MUST be the tenant UUID: the signed webhook resolves this ID.
    const baseUrl = (Deno.env.get("SAAS_PUBLIC_APP_URL") || "https://equipezero-web.github.io/Sistema-L-A-").replace(/\/+$/, "");
    const backUrl = new URL(baseUrl + "/app/plano.html");
    if (backUrl.protocol !== "https:") return reply({ error: "URL pública inválida." }, 503);

    const mpResponse = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        reason: "L&A Royal SaaS - " + plan.name,
        external_reference: tenantId,
        payer_email: user.email,
        back_url: backUrl.href,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: 30,
          currency_id: "BRL",
        },
        status: "pending",
      }),
    });
    const mp = await mpResponse.json().catch(() => ({}));
    if (!mpResponse.ok || !mp?.id) {
      console.error("Mercado Pago checkout error", mpResponse.status);
      return reply({ error: "Não foi possível iniciar a assinatura." }, 502);
    }
    const checkoutUrl = trustedCheckoutUrl(mp.init_point);
    if (!checkoutUrl) {
      console.error("Mercado Pago returned no trusted checkout URL");
      return reply({ error: "Provedor não retornou endereço de pagamento válido. Consulte o suporte." }, 502);
    }

    // A user-scoped Supabase client cannot INSERT subscriptions (RLS denies it).
    // This server-only write is permitted after the owner and plan were verified.
    const { error: subscriptionError } = await serverClient.from("saas_subscriptions").upsert({
      tenant_id: tenantId,
      plan_id: plan.id,
      billing_cycle: "monthly",
      provider: "mercado_pago",
      provider_subscription_id: String(mp.id),
      provider_status: String(mp.status || "pending"),
      status: "pending",
      current_period_start: null,
      current_period_end: null,
      last_payment_id: null,
      last_payment_status: null,
      activated_at: null,
      cancel_at_period_end: false,
    }, { onConflict: "tenant_id" });
    if (subscriptionError) {
      console.error("Could not record pending subscription", subscriptionError.code);
      return reply({
        error: "Assinatura criada no provedor, mas não registrada na plataforma. Contate o suporte; não tente pagar novamente.",
        code: "SUBSCRIPTION_REGISTRATION_FAILED",
      }, 503);
    }
    return reply({ checkout_url: checkoutUrl, status: "pending", subscription_id: String(mp.id) });
  } catch (error) {
    console.error("saas-billing error", error instanceof Error ? error.message : "unexpected");
    return reply({ error: "Não foi possível iniciar a assinatura." }, 500);
  }
});
