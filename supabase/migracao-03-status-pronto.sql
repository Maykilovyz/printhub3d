-- Migração 03: novo status "pronto" (peça feita, esperando o cliente confirmar que recebeu).
-- Fluxo: aberto -> com_orcamento -> aceito -> em_producao -> pronto -> entregue
-- Não apaga nem muda nenhum pedido: só troca a regra (check) que diz quais status valem.
-- Como rodar: Supabase > SQL Editor > cole tudo > Run.

do $$
declare regra text;
begin
  -- Acha o nome da regra atual de status da tabela pedidos (seja qual for) e remove
  select con.conname into regra
    from pg_constraint con
    join pg_class tab on tab.oid = con.conrelid
   where tab.relname = 'pedidos' and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%status%';
  if regra is not null then
    execute format('alter table pedidos drop constraint %I', regra);
  end if;
end $$;

-- Cria a regra de novo, agora com "pronto"
alter table pedidos add constraint pedidos_status_check
  check (status in ('aberto','com_orcamento','aceito','em_producao','pronto','entregue'));
