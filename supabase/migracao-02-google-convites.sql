-- =============================================================
-- PrintHub 3D - Migração 02: login com Google + convites de fabricante
-- Rode no "SQL Editor" do Supabase DEPOIS do schema.sql.
-- Pode rodar mais de uma vez sem problema.
-- =============================================================

-- 1) Usuários agora podem entrar com Google (sem senha própria)
alter table usuarios alter column senha_hash drop not null;           -- conta Google não tem senha aqui
alter table usuarios add column if not exists auth_id uuid unique;    -- id do usuário no Supabase Auth (Google)
alter table usuarios add column if not exists foto_url text;          -- foto do perfil Google
alter table usuarios add column if not exists dono boolean not null default false; -- primeiro fabricante, pode convidar
alter table usuarios alter column tipo set default 'cliente';         -- quem entra sem convite vira cliente

-- Só pode existir UM dono na plataforma
create unique index if not exists um_dono_so on usuarios ((dono)) where dono;

-- 2) CONVITES: o dono convida um e-mail para virar fabricante.
--    Quando essa pessoa entra com o Google usando esse e-mail,
--    a conta dela é criada (ou transformada) em fabricante.
create table if not exists convites (
  id          bigint generated always as identity primary key,
  email       text not null,
  criado_por  bigint not null references usuarios(id) on delete cascade,
  usado_por   bigint references usuarios(id) on delete set null,
  usado_em    timestamptz,
  criado_em   timestamptz not null default now()
);
-- Não pode ter dois convites pendentes para o mesmo e-mail
create unique index if not exists convite_pendente_unico on convites (lower(email)) where usado_em is null;

alter table convites enable row level security;  -- só o servidor acessa
