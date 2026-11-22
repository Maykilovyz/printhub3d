-- =============================================================
-- PrintHub 3D - Estrutura do banco de dados (PostgreSQL / Supabase)
-- Rode este arquivo inteiro no "SQL Editor" do Supabase uma única vez.
-- =============================================================

-- 1) USUÁRIOS: clientes e fabricantes ficam na mesma tabela.
--    A coluna "tipo" diz se a pessoa é 'cliente' ou 'fabricante'.
create table if not exists usuarios (
  id          bigint generated always as identity primary key,
  nome        text not null,
  email       text not null unique,
  senha_hash  text not null,                -- nunca guardamos a senha pura, só o "hash"
  tipo        text not null check (tipo in ('cliente', 'fabricante')),
  cidade      text,
  criado_em   timestamptz not null default now()
);

-- 2) PEDIDOS: o que o cliente quer imprimir.
create table if not exists pedidos (
  id            bigint generated always as identity primary key,
  cliente_id    bigint not null references usuarios(id) on delete cascade,
  categoria     text not null,
  titulo        text not null,
  descricao     text not null,
  largura_mm    integer,
  profundidade_mm integer,
  altura_mm     integer,
  material      text,
  cor           text,
  quantidade    integer not null default 1 check (quantidade > 0),
  prazo         date,
  -- Ciclo de vida do pedido:
  -- aberto -> com_orcamento -> aceito -> em_producao -> entregue
  status        text not null default 'aberto'
                check (status in ('aberto','com_orcamento','aceito','em_producao','pronto','entregue')),
  fabricante_id bigint references usuarios(id),   -- preenchido quando um orçamento é aceito
  criado_em     timestamptz not null default now()
);

-- 3) ANEXOS: imagens e arquivos 3D enviados no pedido.
--    O arquivo em si fica no Storage do Supabase; aqui guardamos só o caminho.
create table if not exists anexos (
  id            bigint generated always as identity primary key,
  pedido_id     bigint not null references pedidos(id) on delete cascade,
  nome_original text not null,
  caminho       text not null,          -- caminho dentro do bucket "anexos"
  tamanho_bytes bigint,
  criado_em     timestamptz not null default now()
);

-- 4) ORÇAMENTOS: propostas dos fabricantes para um pedido.
create table if not exists orcamentos (
  id            bigint generated always as identity primary key,
  pedido_id     bigint not null references pedidos(id) on delete cascade,
  fabricante_id bigint not null references usuarios(id) on delete cascade,
  preco         numeric(10,2) not null check (preco > 0),
  prazo_dias    integer not null check (prazo_dias > 0),
  observacao    text,
  status        text not null default 'pendente'
                check (status in ('pendente','aceito','recusado')),
  criado_em     timestamptz not null default now(),
  unique (pedido_id, fabricante_id)     -- cada fabricante manda só 1 orçamento por pedido
);

-- 5) MENSAGENS: o chat entre cliente e fabricante dentro de um pedido.
create table if not exists mensagens (
  id         bigint generated always as identity primary key,
  pedido_id  bigint not null references pedidos(id) on delete cascade,
  autor_id   bigint not null references usuarios(id) on delete cascade,
  texto      text not null check (length(texto) between 1 and 2000),
  criado_em  timestamptz not null default now()
);

-- Índices para as buscas mais comuns ficarem rápidas
create index if not exists idx_pedidos_cliente   on pedidos(cliente_id);
create index if not exists idx_pedidos_status    on pedidos(status);
create index if not exists idx_anexos_pedido     on anexos(pedido_id);
create index if not exists idx_orcamentos_pedido on orcamentos(pedido_id);
create index if not exists idx_mensagens_pedido  on mensagens(pedido_id, criado_em);

-- SEGURANÇA: ligamos o RLS (Row Level Security) sem criar regras.
-- Resultado: ninguém acessa as tabelas direto pela internet.
-- Só o NOSSO servidor (que usa a chave secreta) consegue ler e gravar.
alter table usuarios   enable row level security;
alter table pedidos    enable row level security;
alter table anexos     enable row level security;
alter table orcamentos enable row level security;
alter table mensagens  enable row level security;

-- STORAGE: bucket privado onde ficam as imagens e arquivos 3D.
insert into storage.buckets (id, name, public)
values ('anexos', 'anexos', false)
on conflict (id) do nothing;
