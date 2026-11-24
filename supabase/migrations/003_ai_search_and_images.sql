-- OlhaPauta CMS v3: Busca Web ao vivo (Tavily opcional / Gemini Search nativo) e Gerador de Capa 16:9
-- Execute este script no SQL Editor do projeto Supabase: travyowpjigplzflvtxb

alter table public.admin_settings
  add column if not exists search_api_key text,
  add column if not exists image_provider text not null default 'auto',
  add column if not exists image_model text not null default 'imagen-3.0-generate-002',
  add column if not exists image_api_key text;
