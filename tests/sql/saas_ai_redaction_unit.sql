-- L&A Royal SaaS: Teste unitário da expressão de anonimização do snapshot de IA.
-- Executável sem empresas ou contas reais; não escreve em tabelas.
do $test$
declare
 data jsonb := '{"financial_30d":{"income":500},"financial_previous_30d":{"income":400},"order_revenue_30d":300,"orders_30d":8,"active_customers":5,"top_products_30d":[{"name":"Produto A","quantity":3,"revenue":150}],"top_services_30d":[{"name":"Serviço A","appointments":2,"revenue":120}]}'::jsonb;
 safe jsonb;
begin
 safe := (data - 'financial_30d' - 'financial_previous_30d' - 'order_revenue_30d')
       || jsonb_build_object(
        'top_products_30d',coalesce((select jsonb_agg(x - 'revenue') from jsonb_array_elements(coalesce(data->'top_products_30d','[]'::jsonb)) x),'[]'::jsonb),
        'top_services_30d',coalesce((select jsonb_agg(x - 'revenue') from jsonb_array_elements(coalesce(data->'top_services_30d','[]'::jsonb)) x),'[]'::jsonb)
       );
 if safe ? 'financial_30d'
    or safe ? 'financial_previous_30d'
    or safe ? 'order_revenue_30d'
    or (safe->'top_products_30d'->0) ? 'revenue'
    or (safe->'top_services_30d'->0) ? 'revenue'
 then raise exception 'TEST FAILED: restricted snapshot includes revenue'; end if;
 if safe->>'orders_30d' <> '8' or safe->>'active_customers' <> '5'
 then raise exception 'TEST FAILED: operational fields were lost'; end if;
end;
$test$;
