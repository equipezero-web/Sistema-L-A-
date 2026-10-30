import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Autenticação obrigatória." }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const publishable = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}").default;
    const secret = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default;
    if (!url || !publishable || !secret) return json({ error: "Configuração interna do Supabase indisponível." }, 500);

    const userClient = createClient(url, publishable, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const admin = createClient(url, secret, { auth: { persistSession: false } });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    const body = await req.json().catch(() => ({}));
    const tenantId = String(body?.tenant_id || "").trim();
    if (!tenantId) return json({ error: "Empresa não informada." }, 400);

    const { data: member } = await admin
      .from("saas_members")
      .select("role,status")
      .eq("tenant_id", tenantId)
      .eq("user_id", userData.user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!member || member.role !== "owner") return json({ error: "Somente o proprietário pode contratar o plano." }, 403);

    const { data: plan, error: planError } = await admin
      .from("saas_plans")
      .select("id,code,name,price_monthly")
      .eq("code", "royal-30")
      .eq("active", true)
      .single();
    if (planError || !plan || Number(plan.price_monthly) !== 30) return json({ error: "Plano Royal 30 indisponível." }, 409);

    const mpToken = Deno.env.get("MP_ACCESS_TOKEN");
    if (!mpToken) {
      return json({
        error: "Mercado Pago ainda não configurado.",
        code: "MP_SECRET_MISSING",
        required_secret: "MP_ACCESS_TOKEN",
      }, 503);
    }

    // O checkout real será criado aqui quando o MP_ACCESS_TOKEN for cadastrado.
    // Nenhum segredo é retornado ao navegador ou persistido no repositório.
    return json({ error: "Integração Mercado Pago aguardando configuração final.", code: "MP_SETUP_PENDING" }, 503);
  } catch (error) {
    console.error("saas-billing", error);
    return json({ error: "Não foi possível iniciar a assinatura." }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
