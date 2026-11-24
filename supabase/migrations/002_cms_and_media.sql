-- OlhaPauta CMS v2: Storage de capas 16:9, suporte a vídeo/H3, autor padrão Jonathas Costa e configurações BYOK de IA
-- Execute este script no SQL Editor do projeto Supabase: travyowpjigplzflvtxb

-- 1. Suporte a vídeo opcional e autor padrão Jonathas Costa
alter table public.pautas
  add column if not exists video_url text;

alter table public.pautas
  alter column autor_nome set default 'Jonathas Costa',
  alter column autor_cargo set default 'Fundador & Editor';

-- 2. Tabela privada de configurações do /admin (BYOK de IA)
-- RLS ativado sem policies públicas: apenas service_role (servidor) acessa
create table if not exists public.admin_settings (
  id text primary key default 'default',
  ai_provider text not null default 'openai',
  ai_model text not null default 'gpt-4o-mini',
  ai_api_key text,
  ai_base_url text,
  updated_at timestamptz not null default now()
);

alter table public.admin_settings enable row level security;

drop trigger if exists trg_admin_settings_updated_at on public.admin_settings;
create trigger trg_admin_settings_updated_at
  before update on public.admin_settings
  for each row execute function public.set_updated_at();

-- 3. Bucket público para capas próprias 16:9 (Google Discover)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pautas-images',
  'pautas-images',
  true,
  10485760,
  array['image/webp', 'image/jpeg', 'image/png', 'image/avif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view pautas images" on storage.objects;
create policy "Public can view pautas images"
  on storage.objects
  for select
  using (bucket_id = 'pautas-images');
