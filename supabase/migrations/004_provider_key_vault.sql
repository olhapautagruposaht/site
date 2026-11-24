-- OlhaPauta CMS v4: Cofre de chaves por provedor (salva todas as APIs separadamente sem sobrescrever)
-- Execute no SQL Editor do projeto Supabase: travyowpjigplzflvtxb

alter table public.admin_settings
  add column if not exists provider_keys jsonb not null default '{}'::jsonb;

-- Migra a chave atual já salva para o cofre do provedor ativo
update public.admin_settings
set provider_keys = jsonb_set(coalesce(provider_keys, '{}'::jsonb), array[ai_provider], to_jsonb(ai_api_key))
where id = 'default'
  and ai_api_key is not null
  and ai_api_key <> ''
  and not (coalesce(provider_keys, '{}'::jsonb) ? ai_provider);
