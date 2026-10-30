import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Método não permitido." }, { status: 405 });

  const accessToken = Deno.env.get("MP_ACCESS_TOKEN");
  const webhookSecret = Deno.env.get("MP_WEBHOOK_SECRET");
  if (!accessToken || !webhookSecret) {
    return Response.json({
      error: "Webhook ainda não configurado.",
      code: "MP_SECRETS_MISSING",
    }, { status: 503 });
  }

  // Fail closed até os secrets serem cadastrados e a validação de assinatura
  // do Mercado Pago ser finalizada. Não processamos eventos não autenticados.
  return Response.json({ error: "Validação do webhook aguardando configuração final." }, { status: 503 });
});
