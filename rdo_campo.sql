-- ============================================================================
--  MARIUÁ · RDO DE CAMPO (app do celular)
--  Rode UMA vez no Supabase: SQL Editor → New query → cole tudo → Run.
--  Pode rodar de novo sem problema: nada é apagado.
--
--  Cria:
--   1. a tabela rdo_campo, onde o app grava cada RDO enviado pelo encarregado;
--   2. o bucket rdo-fotos (privado), onde ficam as fotos;
--   3. as regras de acesso: o encarregado lê e grava só o que é seu, a gestão lê tudo;
--   4. duas funções que o app usa para buscar, num pedido só e com pouca
--      internet, as equipes do cadastro e a programação do dia da equipe;
--   5. a lista de serviços (precificação) para o apontamento no app;
--   6. o login do app por usuário (o começo do e-mail ou a matrícula);
--   7. o que a gestão usa: celulares, configurações do app e quem estava
--      programado no dia;
--   8. quem acessa a gestão (Sistema RDO separado) e quem lê os dados;
--   9. senha nova definida pelo gestor (aba Usuários);
--  10. a programação de obras feita direto no Sistema RDO (aba Programação),
--      que o app recebe junto com a Programação Diária do sistema Mariuá.
--
--  O app NÃO grava no turno_data. O site lê esta tabela (rdo-app.js no rdo.html).
-- ============================================================================


-- 1. TABELA -------------------------------------------------------------------
create table if not exists public.rdo_campo (
  id               uuid primary key,              -- gerado no celular: reenviar não duplica
  data             date not null,                 -- dia do serviço
  equipe_codigo    text not null,                 -- código do Cadastro de Equipes (ALAN-IRC…)
  encarregado      text,
  autor_id         uuid not null default auth.uid() references auth.users (id),
  autor_email      text,

  pep              text,                          -- obra
  nome_obra        text,
  municipio        text,
  atividade        text,
  prog_id          text,                          -- id do registro da Programação, se veio de lá

  hora_inicio      time,
  hora_fim         time,
  clima_manha      text,                          -- bom | nublado | chuva | impraticavel
  clima_tarde      text,

  efetivo          integer,                       -- quantos trabalharam
  efetivo_nomes    jsonb not null default '[]',   -- [{matricula, nome, funcao}]
  servicos         jsonb not null default '[]',   -- [{descricao, qtd, unidade}]
  paralisacao      jsonb,                         -- {motivo, horas, descricao} ou null
  observacoes      text,
  fotos            jsonb not null default '[]',   -- [{path, etapa, legenda, lat, lng, tirada_em, origem}]

  lat              double precision,              -- onde o RDO foi feito
  lng              double precision,
  precisao_m       real,

  finalizado_em    timestamptz,                   -- quando o encarregado tocou em Enviar
  recebido_em      timestamptz not null default now(),
  versao_app       text
);

create index if not exists rdo_campo_data_idx   on public.rdo_campo (data desc);
create index if not exists rdo_campo_equipe_idx on public.rdo_campo (equipe_codigo, data desc);

alter table public.rdo_campo enable row level security;

drop policy if exists "rdo_campo: logado lê"          on public.rdo_campo;
drop policy if exists "rdo_campo: grava o próprio"    on public.rdo_campo;
drop policy if exists "rdo_campo: reenvia o próprio"  on public.rdo_campo;

-- quem lê (dono do RDO ou quem tem acesso à gestão) fica na seção 8

create policy "rdo_campo: grava o próprio" on public.rdo_campo
  for insert to authenticated with check (autor_id = auth.uid());

-- o app reenvia a mesma linha quando a internet cai no meio do envio
create policy "rdo_campo: reenvia o próprio" on public.rdo_campo
  for update to authenticated using (autor_id = auth.uid()) with check (autor_id = auth.uid());

grant select, insert, update on public.rdo_campo to authenticated;
revoke all on public.rdo_campo from anon;

-- aviso em tempo real para o site (o RDO aparece no rdo.html assim que chega)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rdo_campo'
  ) then
    execute 'alter publication supabase_realtime add table public.rdo_campo';
  end if;
exception when undefined_object then
  raise notice 'Publicação supabase_realtime não encontrada; o site atualiza pelo botão.';
end $$;


-- 2. FOTOS --------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rdo-fotos', 'rdo-fotos', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];

drop policy if exists "rdo-fotos: logado envia" on storage.objects;
drop policy if exists "rdo-fotos: logado vê"    on storage.objects;

create policy "rdo-fotos: logado envia" on storage.objects
  for insert to authenticated with check (bucket_id = 'rdo-fotos');

-- quem vê as fotos (quem tem acesso à gestão) fica na seção 8


-- 3. FUNÇÕES QUE O APP USA ----------------------------------------------------
-- Nome sem acento, maiúsculo e com espaços simples, para casar
-- "João  da Silva" com "JOAO DA SILVA".
create or replace function public.rdo_campo_norm(t text)
returns text language sql immutable as $$
  select btrim(regexp_replace(upper(translate(coalesce(t, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '\s+', ' ', 'g'))
$$;

-- Equipes do Cadastro de Equipes (turno_data, chave cadastro_equipes)
create or replace function public.rdo_campo_equipes()
returns jsonb
language sql stable security definer set search_path = public as $$
  with v as (
    select case jsonb_typeof(value::jsonb)
             when 'string' then (value::jsonb #>> '{}')::jsonb
             else value::jsonb end as j
    from turno_data where key = 'cadastro_equipes'
    limit 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'codigo',      btrim(coalesce(e->>'codigo', '')),
           'encarregado', btrim(coalesce(e->>'encarregado', '')),
           'matricula',   btrim(coalesce(e->>'matricula', '')),
           'centro',      coalesce(e->>'centro', ''),
           'utd',         coalesce(e->>'utd', ''),
           'supervisor',  coalesce(e->>'supervisor', ''),
           'qtd_colab',   coalesce(e->>'qtd_colab', ''),
           'tipo',        coalesce(e->>'tipo', ''),
           'veiculo',     coalesce(e->>'veiculo', ''))
         order by e->>'encarregado'), '[]'::jsonb)
  from v,
       jsonb_array_elements(case when jsonb_typeof(v.j -> 'equipes') = 'array'
                                 then v.j -> 'equipes' else '[]'::jsonb end) e
  where btrim(coalesce(e->>'encarregado', '')) <> ''
$$;

-- Programação do dia e quem trabalha com o encarregado: a função
-- rdo_campo_contexto fica na seção 10, porque junta a Programação Diária do
-- sistema Mariuá com a programação feita no Sistema RDO.

revoke all on function public.rdo_campo_equipes()                from public, anon;
grant execute on function public.rdo_campo_equipes()             to authenticated;
grant execute on function public.rdo_campo_norm(text)            to authenticated;


-- 4. LISTA DE SERVIÇOS (precificação) ----------------------------------------
-- A mesma lista do sistema da concessionária (arquivo "precificação_serviços"),
-- para o encarregado apontar no app o serviço com o código certo.
-- O escritório atualiza pela tela RDO → "Lista de serviços" → importar o CSV.
-- Preço NÃO é guardado aqui: o app não precisa e o encarregado não vê valores.
create table if not exists public.servicos_catalogo (
  contrato            text not null,            -- OBRAS - BA…
  codigo              text not null,            -- BA_01…
  descricao           text not null,
  unidade             text,                     -- UN, M, kg, m2, TKM…
  casas_decimais      smallint not null default 0,
  grupo               text,                     -- LINHA MORTA, LINHA VIVA, PODA…
  fator_k             numeric,
  permite_maior_prev  boolean,
  zona                text,
  vigencia_ini        date,
  vigencia_fim        date,
  ativo               boolean not null default true,   -- saiu da lista: fica inativo, não some
  atualizado_em       timestamptz not null default now(),
  atualizado_por      text,
  primary key (contrato, codigo)
);

alter table public.servicos_catalogo enable row level security;
drop policy if exists "servicos_catalogo: logado lê" on public.servicos_catalogo;
create policy "servicos_catalogo: logado lê" on public.servicos_catalogo
  for select to authenticated using (true);
grant select on public.servicos_catalogo to authenticated;
revoke all on public.servicos_catalogo from anon;
-- gravar só pela função abaixo

-- O que o app baixa: só os serviços em vigor, com nomes curtos para pesar pouco.
create or replace function public.rdo_campo_servicos()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'c', codigo, 'd', descricao, 'u', coalesce(unidade, ''), 'k', casas_decimais,
           'g', coalesce(grupo, ''), 'ct', contrato)
         order by contrato, grupo, codigo), '[]'::jsonb)
  from servicos_catalogo
  where ativo
    and (vigencia_ini is null or vigencia_ini <= current_date)
    and (vigencia_fim is null or vigencia_fim >= current_date)
$$;

-- Importação do CSV (feita pelo site). Só gestor. Substitui a lista dos
-- contratos que vierem no arquivo; o que não veio fica inativo.
create or replace function public.rdo_campo_importar_servicos(p_itens jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_gestor    boolean := true;
  v_email     text;
  v_contratos text[];
  n_gravados  integer := 0;
  n_inativos  integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Entre no sistema para atualizar a lista de serviços.';
  end if;
  begin
    execute 'select public.is_gestor()' into v_gestor;
  exception when undefined_function then
    v_gestor := true;                -- banco sem perfis de gestor: qualquer logado importa
  end;
  if not coalesce(v_gestor, false) then
    raise exception 'Só gestores podem atualizar a lista de serviços.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'O arquivo não trouxe nenhum serviço.';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  with itens as (
    select distinct on (btrim(e->>'contrato'), btrim(e->>'codigo'))
           btrim(e->>'contrato')                       as contrato,
           btrim(e->>'codigo')                         as codigo,
           btrim(e->>'descricao')                      as descricao,
           nullif(btrim(coalesce(e->>'unidade', '')), '') as unidade,
           coalesce(nullif(e->>'casas', '')::smallint, 0) as casas,
           nullif(btrim(coalesce(e->>'grupo', '')), '')   as grupo,
           nullif(e->>'fator_k', '')::numeric           as fator_k,
           nullif(e->>'permite_maior_prev', '')::boolean as permite,
           nullif(btrim(coalesce(e->>'zona', '')), '')    as zona,
           nullif(e->>'vigencia_ini', '')::date         as vig_ini,
           nullif(e->>'vigencia_fim', '')::date         as vig_fim
    from jsonb_array_elements(p_itens) e
    where btrim(coalesce(e->>'contrato', '')) <> ''
      and btrim(coalesce(e->>'codigo', ''))   <> ''
      and btrim(coalesce(e->>'descricao', '')) <> ''
    order by btrim(e->>'contrato'), btrim(e->>'codigo'), nullif(e->>'vigencia_ini', '')::date desc nulls last
  )
  insert into servicos_catalogo as s
    (contrato, codigo, descricao, unidade, casas_decimais, grupo, fator_k, permite_maior_prev,
     zona, vigencia_ini, vigencia_fim, ativo, atualizado_em, atualizado_por)
  select contrato, codigo, descricao, unidade, casas, grupo, fator_k, permite,
         zona, vig_ini, vig_fim, true, now(), v_email
  from itens
  on conflict (contrato, codigo) do update set
    descricao = excluded.descricao, unidade = excluded.unidade, casas_decimais = excluded.casas_decimais,
    grupo = excluded.grupo, fator_k = excluded.fator_k, permite_maior_prev = excluded.permite_maior_prev,
    zona = excluded.zona, vigencia_ini = excluded.vigencia_ini, vigencia_fim = excluded.vigencia_fim,
    ativo = true, atualizado_em = now(), atualizado_por = excluded.atualizado_por;
  get diagnostics n_gravados = row_count;

  select array_agg(distinct btrim(e->>'contrato')) into v_contratos
  from jsonb_array_elements(p_itens) e where btrim(coalesce(e->>'contrato', '')) <> '';

  update servicos_catalogo s set ativo = false, atualizado_em = now(), atualizado_por = v_email
  where s.ativo and s.contrato = any(v_contratos)
    and not exists (select 1 from jsonb_array_elements(p_itens) e
                    where btrim(e->>'contrato') = s.contrato and btrim(e->>'codigo') = s.codigo);
  get diagnostics n_inativos = row_count;

  return jsonb_build_object('gravados', n_gravados, 'inativos', n_inativos, 'contratos', to_jsonb(v_contratos));
end
$$;

revoke all on function public.rdo_campo_servicos()                 from public, anon;
revoke all on function public.rdo_campo_importar_servicos(jsonb)   from public, anon;
grant execute on function public.rdo_campo_servicos()              to authenticated;
grant execute on function public.rdo_campo_importar_servicos(jsonb) to authenticated;


-- 6. LOGIN POR USUÁRIO ---------------------------------------------------------
-- O app pede usuário e senha. O Supabase entra por e-mail, então esta função
-- devolve o e-mail da conta a partir do usuário:
--   1. o começo do e-mail, antes do @ (joao.araujo → joao.araujo@empresa…);
--   2. se não achar, a matrícula guardada na conta ou na tabela de usuários
--      do sistema (a que tem as colunas email e matricula).
-- Só responde para o usuário exato (não lista nem procura parecidos) e só
-- devolve e-mail de conta que existe. Se dois e-mails tiverem o mesmo começo,
-- pede o e-mail completo.
create or replace function public.rdo_campo_email_login(p_usuario text)
returns text
language plpgsql stable security definer set search_path = public, auth as $$
declare
  u       text := lower(btrim(coalesce(p_usuario, '')));
  achados text[];
  extra   text[];
  t       record;
begin
  if u = '' or length(u) > 120 then
    return null;
  end if;

  if position('@' in u) > 0 then
    select array_agg(distinct lower(email)) into achados
    from auth.users where lower(email) = u and deleted_at is null;
  else
    select array_agg(distinct lower(email)) into achados
    from auth.users where lower(split_part(email, '@', 1)) = u and deleted_at is null;

    if coalesce(array_length(achados, 1), 0) = 0 then
      select array_agg(distinct lower(email)) into achados
      from auth.users
      where deleted_at is null
        and (btrim(raw_user_meta_data ->> 'matricula') = u or btrim(raw_app_meta_data ->> 'matricula') = u);
    end if;

    if coalesce(array_length(achados, 1), 0) = 0 then
      for t in
        select c.table_name
        from information_schema.columns c
        where c.table_schema = 'public' and c.column_name in ('email', 'matricula')
          and c.table_name not in ('solicitacoes')
        group by c.table_name
        having count(distinct c.column_name) = 2
      loop
        begin
          execute format(
            'select array_agg(distinct lower(a.email)) from public.%I x
               join auth.users a on lower(a.email) = lower(x.email) and a.deleted_at is null
              where lower(btrim(x.matricula::text)) = $1', t.table_name)
            into extra using u;
          if coalesce(array_length(extra, 1), 0) > 0 then
            achados := extra;
            exit;
          end if;
        exception when others then
          null;                         -- tabela sem permissão ou formato diferente: ignora
        end;
      end loop;
    end if;
  end if;

  if coalesce(array_length(achados, 1), 0) = 0 then
    return null;
  end if;
  if array_length(achados, 1) > 1 then
    raise exception 'Há mais de uma conta com esse usuário. Entre com o e-mail completo.';
  end if;
  return achados[1];
end
$$;

revoke all on function public.rdo_campo_email_login(text) from public;
grant execute on function public.rdo_campo_email_login(text) to anon, authenticated;


-- 7. GESTÃO DO APP (página "App de campo" do site) ---------------------------
-- 7a. Celulares: cada celular informa versão, fila de envio e último contato.
--     Uma linha por celular e usuário (id = aparelho:usuário).
create table if not exists public.rdo_campo_aparelhos (
  id               text primary key,
  autor_id         uuid not null default auth.uid() references auth.users (id),
  usuario          text,
  equipe_codigo    text,
  encarregado      text,
  versao_app       text,
  plataforma       text,
  instalado        boolean,
  fila             integer not null default 0,     -- RDOs esperando envio
  com_erro         integer not null default 0,     -- RDOs recusados pelo banco
  fila_desde       timestamptz,                    -- o mais antigo da fila
  catalogo_em      timestamptz,                    -- data da lista de serviços no celular
  ultimo_contato   timestamptz not null default now(),
  primeiro_contato timestamptz not null default now()
);
alter table public.rdo_campo_aparelhos enable row level security;
drop policy if exists "aparelhos: logado lê"        on public.rdo_campo_aparelhos;
drop policy if exists "aparelhos: grava o próprio"  on public.rdo_campo_aparelhos;
drop policy if exists "aparelhos: atualiza o próprio" on public.rdo_campo_aparelhos;
create policy "aparelhos: grava o próprio" on public.rdo_campo_aparelhos for insert to authenticated with check (autor_id = auth.uid());
create policy "aparelhos: atualiza o próprio" on public.rdo_campo_aparelhos for update to authenticated
  using (autor_id = auth.uid()) with check (autor_id = auth.uid());
grant select, insert, update on public.rdo_campo_aparelhos to authenticated;
revoke all on public.rdo_campo_aparelhos from anon;

-- 7b. Configurações que o app lê ao abrir (aviso, fotos mínimas, motivos…).
create table if not exists public.rdo_campo_config (
  id            smallint primary key default 1 check (id = 1),
  dados         jsonb not null default '{}',
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
insert into public.rdo_campo_config (id, dados) values (1, '{}') on conflict (id) do nothing;
alter table public.rdo_campo_config enable row level security;
drop policy if exists "config: logado lê" on public.rdo_campo_config;
create policy "config: logado lê" on public.rdo_campo_config for select to authenticated using (true);
grant select on public.rdo_campo_config to authenticated;
revoke all on public.rdo_campo_config from anon;

-- Só gestor salva. Guarda apenas os campos conhecidos, já conferidos.
create or replace function public.rdo_campo_salvar_config(p_dados jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_gestor boolean := true;
  v_email  text;
  d        jsonb := '{}'::jsonb;
  motivos  jsonb;
begin
  if auth.uid() is null then raise exception 'Entre no sistema para salvar.'; end if;
  begin
    execute 'select public.is_gestor()' into v_gestor;
  exception when undefined_function then v_gestor := true;
  end;
  if not coalesce(v_gestor, false) then raise exception 'Só gestores podem mudar as configurações do app.'; end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'Configuração inválida.'; end if;

  d := jsonb_build_object(
    'aviso',          left(btrim(coalesce(p_dados ->> 'aviso', '')), 500),
    'aviso_ativo',    coalesce((p_dados ->> 'aviso_ativo')::boolean, false),
    'fotos_minimas',  greatest(0, least(10, coalesce(nullif(p_dados ->> 'fotos_minimas', '')::int, 1))),
    'exigir_termino', coalesce((p_dados ->> 'exigir_termino')::boolean, false),
    'versao_minima',  left(btrim(coalesce(p_dados ->> 'versao_minima', '')), 20));
  if jsonb_typeof(p_dados -> 'motivos') = 'array' then
    select coalesce(jsonb_agg(m), '[]'::jsonb) into motivos
    from (select left(btrim(x), 60) as m
          from jsonb_array_elements_text(p_dados -> 'motivos') as x
          where btrim(x) <> '' limit 20) t;
    d := d || jsonb_build_object('motivos', motivos);
  end if;

  select email into v_email from auth.users where id = auth.uid();
  update rdo_campo_config set dados = d, atualizado_em = now(), atualizado_por = v_email where id = 1;
  return d;
end
$$;

revoke all on function public.rdo_campo_salvar_config(jsonb) from public, anon;
grant execute on function public.rdo_campo_salvar_config(jsonb) to authenticated;

-- 7c. Quem estava programado num dia (para "equipes sem RDO"): a função
--     rdo_campo_programados fica na seção 10, porque soma a Programação Diária
--     do sistema Mariuá com a programação feita no Sistema RDO.


-- 8. SISTEMA RDO SEPARADO: QUEM ACESSA A GESTÃO E QUEM LÊ OS DADOS ------------
-- A gestão (página inicial do SISTEMA-RDO) tem login próprio. Entra quem é
-- gestor (is_gestor()) ou quem um gestor liberou aqui. O encarregado vê só os
-- próprios RDOs; a gestão vê todos, com as fotos.
create table if not exists public.rdo_campo_acesso (
  email         text primary key,
  ativo         boolean not null default true,
  incluido_em   timestamptz not null default now(),
  incluido_por  text
);
alter table public.rdo_campo_acesso enable row level security;
revoke all on public.rdo_campo_acesso from anon, authenticated;     -- só pelas funções abaixo

-- 'gestor', 'escritorio' ou null (sem acesso à gestão)
create or replace function public.rdo_campo_meu_acesso()
returns text
language plpgsql stable security definer set search_path = public, auth as $$
declare
  v_gestor boolean := false;
  v_email  text;
begin
  if auth.uid() is null then return null; end if;
  begin
    execute 'select public.is_gestor()' into v_gestor;
  exception when undefined_function then
    return 'gestor';               -- banco sem perfis de gestor: todo logado é gestor
  end;
  if coalesce(v_gestor, false) then return 'gestor'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if exists (select 1 from rdo_campo_acesso where email = v_email and ativo) then return 'escritorio'; end if;
  return null;
end
$$;

create or replace function public.rdo_campo_acessos()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if public.rdo_campo_meu_acesso() is distinct from 'gestor' then
    raise exception 'Só gestores veem quem tem acesso à gestão.';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('email', email, 'incluido_em', incluido_em, 'incluido_por', incluido_por)
                                    order by email)
                   from rdo_campo_acesso where ativo), '[]'::jsonb);
end
$$;

-- p_usuario: o usuário (começo do e-mail), a matrícula ou o e-mail da conta
create or replace function public.rdo_campo_definir_acesso(p_usuario text, p_ativo boolean)
returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  v_email text;
  v_quem  text;
begin
  if public.rdo_campo_meu_acesso() is distinct from 'gestor' then
    raise exception 'Só gestores liberam acesso à gestão.';
  end if;
  v_email := public.rdo_campo_email_login(p_usuario);
  if v_email is null then
    raise exception 'Não achamos uma conta com esse usuário. Confira ou crie a conta no Admin do sistema Mariuá.';
  end if;
  select email into v_quem from auth.users where id = auth.uid();
  insert into rdo_campo_acesso (email, ativo, incluido_em, incluido_por)
  values (lower(v_email), coalesce(p_ativo, true), now(), v_quem)
  on conflict (email) do update set ativo = excluded.ativo, incluido_em = now(), incluido_por = excluded.incluido_por;
  return jsonb_build_object('email', lower(v_email), 'ativo', coalesce(p_ativo, true));
end
$$;

revoke all on function public.rdo_campo_meu_acesso()                   from public, anon;
revoke all on function public.rdo_campo_acessos()                      from public, anon;
revoke all on function public.rdo_campo_definir_acesso(text, boolean)  from public, anon;
grant execute on function public.rdo_campo_meu_acesso()                to authenticated;
grant execute on function public.rdo_campo_acessos()                   to authenticated;
grant execute on function public.rdo_campo_definir_acesso(text, boolean) to authenticated;

-- leitura: o dono vê o que é seu; quem tem acesso à gestão vê tudo
drop policy if exists "rdo_campo: dono ou gestão lê" on public.rdo_campo;
create policy "rdo_campo: dono ou gestão lê" on public.rdo_campo
  for select to authenticated
  using (autor_id = auth.uid() or (select public.rdo_campo_meu_acesso()) is not null);

drop policy if exists "aparelhos: dono ou gestão lê" on public.rdo_campo_aparelhos;
create policy "aparelhos: dono ou gestão lê" on public.rdo_campo_aparelhos
  for select to authenticated
  using (autor_id = auth.uid() or (select public.rdo_campo_meu_acesso()) is not null);

drop policy if exists "rdo-fotos: gestão vê" on storage.objects;
create policy "rdo-fotos: gestão vê" on storage.objects
  for select to authenticated
  using (bucket_id = 'rdo-fotos' and (select public.rdo_campo_meu_acesso()) is not null);

-- 9. SENHA NOVA PELO GESTOR (aba Usuários da gestão) -------------------------
-- As contas são as mesmas do sistema Mariuá (criadas pelas funções admin_* que
-- o Admin já usa). Esta função deixa o gestor trocar a senha de um encarregado
-- que esqueceu, sem depender de e-mail.
create or replace function public.rdo_campo_definir_senha(p_email text, p_senha text)
returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if public.rdo_campo_meu_acesso() is distinct from 'gestor' then
    raise exception 'Só gestores trocam a senha de outra pessoa.';
  end if;
  if length(coalesce(p_senha, '')) < 6 then
    raise exception 'A senha precisa de pelo menos 6 caracteres.';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')),
         updated_at = now()
   where lower(email) = lower(trim(p_email)) and deleted_at is null;
  if not found then
    raise exception 'Não achamos a conta %.', p_email;
  end if;
end
$$;

revoke all on function public.rdo_campo_definir_senha(text, text) from public, anon;
grant execute on function public.rdo_campo_definir_senha(text, text) to authenticated;


-- 10. PROGRAMAÇÃO DE OBRAS DIRETO PELO SISTEMA RDO ----------------------------
-- O escritório programa as obras de cada equipe na gestão (aba Programação),
-- sem precisar do sistema Mariuá. A Programação Diária do sistema Mariuá
-- continua valendo: o app recebe as duas juntas, e as duas contam em
-- "programadas sem RDO". Quem tem acesso à gestão (gestor ou escritório)
-- programa; o encarregado recebe só o que é da equipe dele.
create table if not exists public.rdo_programacao (
  id              uuid primary key default gen_random_uuid(),
  data            date not null,                 -- dia programado
  equipe_codigo   text not null,                 -- código do Cadastro de Equipes (ALAN-IRC…)
  encarregado     text,                          -- do cadastro, na hora de programar
  pep             text,
  nome_obra       text,
  municipio       text,
  atividade       text,
  qtd_previsto    numeric,
  criado_em       timestamptz not null default now(),
  criado_por      text,
  atualizado_em   timestamptz not null default now(),
  atualizado_por  text
);
create index if not exists rdo_programacao_data_idx on public.rdo_programacao (data, equipe_codigo);
alter table public.rdo_programacao enable row level security;
revoke all on public.rdo_programacao from anon, authenticated;     -- só pelas funções abaixo

-- Dois nomes já normalizados casam quando um começa pelo outro
-- ("ALAN CONCEICAO" e "ALAN CONCEICAO SANTOS"), como no resto do sistema.
create or replace function public.rdo_campo_casa(a text, b text)
returns boolean language sql immutable as $$
  select coalesce(a, '') <> '' and coalesce(b, '') <> ''
     and (a = b or starts_with(a, b) or starts_with(b, a))
$$;

-- Programação Diária do sistema Mariuá (turno_data, chave prog_diaria) de um
-- dia, na ordem em que está lá. Só as funções abaixo usam: o celular não
-- baixa a programação inteira.
create or replace function public.rdo_campo_prog_mariua(p_data date)
returns table (item jsonb, ordem bigint)
language sql stable security definer set search_path = public as $$
  select x.e, x.o
  from (select value::jsonb as j from turno_data
        where key = 'prog_diaria' order by updated_at desc nulls last limit 1) t,
       jsonb_array_elements(case when jsonb_typeof(t.j) = 'array' then t.j else '[]'::jsonb end)
         with ordinality as x(e, o)
  where left(coalesce(x.e->>'data', ''), 10) = to_char(p_data, 'YYYY-MM-DD')
$$;

-- 10a. O que o app baixa: a programação do dia da equipe (as duas origens) e
--      quem trabalha com o encarregado (chave funcionario_equipe + funcionarios).
--      A do Sistema RDO casa pelo código da equipe no cadastro ou pelo nome do
--      encarregado; a do sistema Mariuá, pelo nome do encarregado.
create or replace function public.rdo_campo_contexto(p_data date, p_encarregado text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  alvo text := public.rdo_campo_norm(p_encarregado);
  prog jsonb := '[]'::jsonb;
  efet jsonb := '[]'::jsonb;
begin
  if alvo = '' or p_data is null then
    return jsonb_build_object('programacao', prog, 'efetivo', efet);
  end if;

  with cods as (            -- equipes desse encarregado no Cadastro de Equipes
    select upper(btrim(q->>'codigo')) as codigo
    from jsonb_array_elements(public.rdo_campo_equipes()) q
    where public.rdo_campo_casa(public.rdo_campo_norm(q->>'encarregado'), alvo)
  ), itens as (
    select 1 as grupo, m.ordem, jsonb_build_object(
             'id',            m.item->>'id',
             'pep',           coalesce(m.item->>'pep', ''),
             'nome_obra',     coalesce(m.item->>'nome_obra', ''),
             'municipio',     coalesce(m.item->>'municipio', ''),
             'atividade',     coalesce(m.item->>'atividade', ''),
             'atividade_cod', coalesce(m.item->>'atividade_cod', ''),
             'tipo',          coalesce(m.item->>'tipo', ''),
             'turno',         coalesce(m.item->>'turno', ''),
             'qtd_previsto',  m.item->'qtd_previsto',
             'origem',        'mariua') as x
    from public.rdo_campo_prog_mariua(p_data) m
    where public.rdo_campo_casa(public.rdo_campo_norm(m.item->>'encarregado'), alvo)
    union all
    select 2, row_number() over (order by p.criado_em, p.id), jsonb_build_object(
             'id',            p.id::text,
             'pep',           coalesce(p.pep, ''),
             'nome_obra',     coalesce(p.nome_obra, ''),
             'municipio',     coalesce(p.municipio, ''),
             'atividade',     coalesce(p.atividade, ''),
             'atividade_cod', '',
             'tipo',          '',
             'turno',         '',
             'qtd_previsto',  to_jsonb(p.qtd_previsto),
             'origem',        'rdo')
    from rdo_programacao p
    where p.data = p_data
      and (upper(btrim(p.equipe_codigo)) in (select codigo from cods)
           or public.rdo_campo_casa(public.rdo_campo_norm(p.encarregado), alvo))
  )
  select coalesce(jsonb_agg(x order by grupo, ordem), '[]'::jsonb) into prog from itens;

  with fe as (
    select value::jsonb as j from turno_data where key = 'funcionario_equipe' limit 1
  ), linhas as (
    select btrim(split_part(l, '|', 1)) as mat,
           btrim(split_part(l, '|', 3)) as funcao,
           public.rdo_campo_norm(split_part(l, '|', 5)) as enc
    from fe, regexp_split_to_table(coalesce(fe.j->>'data', ''), E'\n') as l
    where btrim(l) <> ''
  ), daequipe as (
    select distinct on (mat) mat, funcao from linhas
    where mat <> '' and enc <> ''
      and (enc = alvo or starts_with(enc, alvo) or starts_with(alvo, enc))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'matricula', d.mat,
           'funcao',    d.funcao,
           'nome',      coalesce(f.nome, ''))
         order by f.nome nulls last, d.mat), '[]'::jsonb)
    into efet
  from daequipe d
  left join funcionarios f on f.matricula::text = d.mat;

  return jsonb_build_object('programacao', prog, 'efetivo', efet);
end
$$;

-- 10b. Quem estava programado num dia (para "programadas sem RDO"), com o
--      código da equipe. Soma as duas origens na mesma equipe.
create or replace function public.rdo_campo_programados(p_data date)
returns jsonb
language sql stable security definer set search_path = public as $$
  with cad as (
    select public.rdo_campo_norm(q->>'encarregado') as n, nullif(btrim(q->>'codigo'), '') as codigo,
           btrim(q->>'encarregado') as nome
    from jsonb_array_elements(public.rdo_campo_equipes()) q
  ), mariua as (            -- Programação Diária do sistema Mariuá, por encarregado
    select public.rdo_campo_norm(m.item->>'encarregado') as n, min(m.item->>'encarregado') as nome, count(*) as obras
    from public.rdo_campo_prog_mariua(p_data) m
    where public.rdo_campo_norm(m.item->>'encarregado') <> ''
    group by 1
  ), juntos as (
    select mariua.nome as encarregado, c.codigo, mariua.obras
    from mariua
    left join lateral (
      select cad.codigo from cad
      where public.rdo_campo_casa(cad.n, mariua.n)
      order by (cad.n = mariua.n) desc limit 1
    ) c on true
    union all               -- programação feita no Sistema RDO, por equipe
    select min(p.encarregado), min(btrim(p.equipe_codigo)), count(*)
    from rdo_programacao p
    where p.data = p_data
    group by upper(btrim(p.equipe_codigo))
  )
  select coalesce(jsonb_agg(jsonb_build_object('encarregado', coalesce(e.nome, g.encarregado), 'codigo', g.codigo, 'obras', g.obras)
                            order by coalesce(e.nome, g.encarregado)), '[]'::jsonb)
  from (
    select max(encarregado) as encarregado, min(codigo) as codigo, sum(obras)::int as obras
    from juntos
    group by coalesce(upper(codigo), 'ENC:' || public.rdo_campo_norm(encarregado))
  ) g
  left join lateral (       -- com o código, o nome como está no Cadastro de Equipes
    select cad.nome from cad where upper(cad.codigo) = upper(g.codigo) limit 1
  ) e on true
$$;

-- 10c. O que a gestão mostra na aba Programação: tudo o que está programado
--      no dia, das duas origens. A do sistema Mariuá vem com o código da
--      equipe quando o encarregado casa com o cadastro, e só se muda lá.
create or replace function public.rdo_programacao_dia(p_data date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  res jsonb;
begin
  if public.rdo_campo_meu_acesso() is null then
    raise exception 'Só quem tem acesso à gestão vê a programação.';
  end if;
  if p_data is null then
    raise exception 'Escolha o dia da programação.';
  end if;

  with cad as (
    select public.rdo_campo_norm(q->>'encarregado') as n, nullif(btrim(q->>'codigo'), '') as codigo
    from jsonb_array_elements(public.rdo_campo_equipes()) q
  ), itens as (
    select 1 as grupo, m.ordem, jsonb_build_object(
             'id',            m.item->>'id',
             'origem',        'mariua',
             'data',          p_data,
             'equipe_codigo', coalesce(c.codigo, ''),
             'encarregado',   coalesce(m.item->>'encarregado', ''),
             'pep',           coalesce(m.item->>'pep', ''),
             'nome_obra',     coalesce(m.item->>'nome_obra', ''),
             'municipio',     coalesce(m.item->>'municipio', ''),
             'atividade',     coalesce(m.item->>'atividade', ''),
             'turno',         coalesce(m.item->>'turno', ''),
             'qtd_previsto',  m.item->'qtd_previsto') as x
    from public.rdo_campo_prog_mariua(p_data) m
    left join lateral (
      select cad.codigo from cad
      where public.rdo_campo_casa(cad.n, public.rdo_campo_norm(m.item->>'encarregado'))
      order by (cad.n = public.rdo_campo_norm(m.item->>'encarregado')) desc limit 1
    ) c on true
    union all
    select 2, row_number() over (order by p.criado_em, p.id), to_jsonb(p) || jsonb_build_object('origem', 'rdo')
    from rdo_programacao p
    where p.data = p_data
  )
  select coalesce(jsonb_agg(x order by grupo, ordem), '[]'::jsonb) into res from itens;
  return res;
end
$$;

-- 10d. Programar uma obra (sem id) ou mudar uma já programada (com id).
--      O encarregado vem do Cadastro de Equipes, pelo código da equipe.
create or replace function public.rdo_programacao_salvar(p_item jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_id    uuid;
  v_data  date;
  v_tx    text;
  v_eq    text;
  v_enc   text;
  v_qtd   numeric;
  r       rdo_programacao;
begin
  if public.rdo_campo_meu_acesso() is null then
    raise exception 'Só quem tem acesso à gestão programa obras.';
  end if;
  if p_item is null or jsonb_typeof(p_item) <> 'object' then
    raise exception 'Programação inválida.';
  end if;

  begin
    v_data := nullif(btrim(coalesce(p_item->>'data', '')), '')::date;
  exception when others then
    raise exception 'Dia inválido. Escolha o dia no calendário.';
  end;
  if v_data is null then
    raise exception 'Escolha o dia da programação.';
  end if;

  v_tx := btrim(coalesce(p_item->>'equipe_codigo', ''));
  if v_tx = '' then
    raise exception 'Escolha a equipe.';
  end if;
  select btrim(q->>'codigo'), btrim(q->>'encarregado') into v_eq, v_enc
  from jsonb_array_elements(public.rdo_campo_equipes()) q
  where upper(btrim(q->>'codigo')) = upper(v_tx)
  limit 1;
  if v_eq is null then
    raise exception 'A equipe % não está no Cadastro de Equipes. O app só mostra a programação de equipes do cadastro.', v_tx;
  end if;

  if btrim(coalesce(p_item->>'pep', '')) = '' and btrim(coalesce(p_item->>'nome_obra', '')) = '' then
    raise exception 'Escreva o PEP ou o nome da obra.';
  end if;

  begin
    v_qtd := nullif(replace(btrim(coalesce(p_item->>'qtd_previsto', '')), ',', '.'), '')::numeric;
  exception when others then
    raise exception 'Quantidade prevista inválida. Use só números, como 6 ou 320,5.';
  end;
  if v_qtd is not null and v_qtd < 0 then
    raise exception 'A quantidade prevista não pode ser negativa.';
  end if;

  begin
    v_id := nullif(btrim(coalesce(p_item->>'id', '')), '')::uuid;
  exception when others then
    raise exception 'Só dá para mudar aqui as obras programadas no Sistema RDO. As do sistema Mariuá mudam lá.';
  end;

  select email into v_email from auth.users where id = auth.uid();

  if v_id is null then
    insert into rdo_programacao (data, equipe_codigo, encarregado, pep, nome_obra, municipio, atividade,
                                 qtd_previsto, criado_por, atualizado_por)
    values (v_data, v_eq, nullif(v_enc, ''),
            nullif(left(btrim(coalesce(p_item->>'pep', '')), 60), ''),
            nullif(left(btrim(coalesce(p_item->>'nome_obra', '')), 160), ''),
            nullif(left(btrim(coalesce(p_item->>'municipio', '')), 80), ''),
            nullif(left(btrim(coalesce(p_item->>'atividade', '')), 160), ''),
            v_qtd, v_email, v_email)
    returning * into r;
  else
    update rdo_programacao set
      data           = v_data,
      equipe_codigo  = v_eq,
      encarregado    = nullif(v_enc, ''),
      pep            = nullif(left(btrim(coalesce(p_item->>'pep', '')), 60), ''),
      nome_obra      = nullif(left(btrim(coalesce(p_item->>'nome_obra', '')), 160), ''),
      municipio      = nullif(left(btrim(coalesce(p_item->>'municipio', '')), 80), ''),
      atividade      = nullif(left(btrim(coalesce(p_item->>'atividade', '')), 160), ''),
      qtd_previsto   = v_qtd,
      atualizado_em  = now(),
      atualizado_por = v_email
    where id = v_id
    returning * into r;
    if not found then
      raise exception 'Essa obra programada não existe mais. Toque em Atualizar.';
    end if;
  end if;

  return to_jsonb(r) || jsonb_build_object('origem', 'rdo');
end
$$;

-- 10e. Tirar uma obra da programação. O RDO que já veio dela continua guardado.
create or replace function public.rdo_programacao_excluir(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.rdo_campo_meu_acesso() is null then
    raise exception 'Só quem tem acesso à gestão tira obras da programação.';
  end if;
  delete from rdo_programacao where id = p_id;
  if not found then
    raise exception 'Essa obra programada não existe mais. Toque em Atualizar.';
  end if;
end
$$;

-- 10f. Copiar a programação de um dia para outro (a equipe que continua na
--      mesma obra). Com p_com_mariua, copia também a Programação Diária do
--      sistema Mariuá daquele dia, que passa a ser do Sistema RDO. Obra que já
--      está programada no dia de destino, para a mesma equipe, não se repete.
create or replace function public.rdo_programacao_copiar(p_de date, p_para date, p_com_mariua boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email      text;
  v_destino    jsonb;
  o            record;
  n_copiadas   integer := 0;
  n_repetidas  integer := 0;
  n_sem_equipe integer := 0;
begin
  if public.rdo_campo_meu_acesso() is null then
    raise exception 'Só quem tem acesso à gestão programa obras.';
  end if;
  if p_de is null or p_para is null then
    raise exception 'Escolha os dois dias.';
  end if;
  if p_de = p_para then
    raise exception 'Escolha dois dias diferentes.';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  -- o que o sistema Mariuá já tem no dia de destino, para não repetir
  select coalesce(jsonb_agg(m.item), '[]'::jsonb) into v_destino
  from public.rdo_campo_prog_mariua(p_para) m;

  for o in
    with cad as (
      select public.rdo_campo_norm(q->>'encarregado') as n, nullif(btrim(q->>'codigo'), '') as codigo,
             btrim(q->>'encarregado') as encarregado
      from jsonb_array_elements(public.rdo_campo_equipes()) q
    )
    select p.equipe_codigo, p.encarregado, p.pep, p.nome_obra, p.municipio, p.atividade, p.qtd_previsto,
           1 as grupo, row_number() over (order by p.criado_em, p.id) as ordem
    from rdo_programacao p
    where p.data = p_de
    union all
    select c.codigo, coalesce(c.encarregado, m.item->>'encarregado'),
           nullif(btrim(coalesce(m.item->>'pep', '')), ''),
           nullif(btrim(coalesce(m.item->>'nome_obra', '')), ''),
           nullif(btrim(coalesce(m.item->>'municipio', '')), ''),
           nullif(btrim(coalesce(m.item->>'atividade', '')), ''),
           case when btrim(coalesce(m.item->>'qtd_previsto', '')) ~ '^-?[0-9]+([.,][0-9]+)?$'
                then replace(btrim(m.item->>'qtd_previsto'), ',', '.')::numeric end,
           2, m.ordem
    from public.rdo_campo_prog_mariua(p_de) m
    left join lateral (
      select cad.codigo, cad.encarregado from cad
      where public.rdo_campo_casa(cad.n, public.rdo_campo_norm(m.item->>'encarregado'))
      order by (cad.n = public.rdo_campo_norm(m.item->>'encarregado')) desc limit 1
    ) c on true
    where coalesce(p_com_mariua, false)
    order by 8, 9
  loop
    if o.equipe_codigo is null or (o.pep is null and o.nome_obra is null) then
      n_sem_equipe := n_sem_equipe + 1;
      continue;
    end if;
    if exists (select 1 from rdo_programacao x
               where x.data = p_para
                 and upper(btrim(x.equipe_codigo)) = upper(btrim(o.equipe_codigo))
                 and public.rdo_campo_norm(x.pep)       = public.rdo_campo_norm(o.pep)
                 and public.rdo_campo_norm(x.nome_obra) = public.rdo_campo_norm(o.nome_obra)
                 and public.rdo_campo_norm(x.atividade) = public.rdo_campo_norm(o.atividade))
       or exists (select 1 from jsonb_array_elements(v_destino) d
                  where public.rdo_campo_casa(public.rdo_campo_norm(d->>'encarregado'), public.rdo_campo_norm(o.encarregado))
                    and public.rdo_campo_norm(d->>'pep')       = public.rdo_campo_norm(o.pep)
                    and public.rdo_campo_norm(d->>'nome_obra') = public.rdo_campo_norm(o.nome_obra)
                    and public.rdo_campo_norm(d->>'atividade') = public.rdo_campo_norm(o.atividade)) then
      n_repetidas := n_repetidas + 1;
      continue;
    end if;
    insert into rdo_programacao (data, equipe_codigo, encarregado, pep, nome_obra, municipio, atividade,
                                 qtd_previsto, criado_por, atualizado_por)
    values (p_para, o.equipe_codigo, o.encarregado, o.pep, o.nome_obra, o.municipio, o.atividade,
            o.qtd_previsto, v_email, v_email);
    n_copiadas := n_copiadas + 1;
  end loop;

  return jsonb_build_object('copiadas', n_copiadas, 'repetidas', n_repetidas, 'sem_equipe', n_sem_equipe);
end
$$;

revoke all on function public.rdo_campo_prog_mariua(date)                  from public, anon, authenticated;
revoke all on function public.rdo_campo_contexto(date, text)               from public, anon;
revoke all on function public.rdo_campo_programados(date)                  from public, anon;
revoke all on function public.rdo_programacao_dia(date)                    from public, anon;
revoke all on function public.rdo_programacao_salvar(jsonb)                from public, anon;
revoke all on function public.rdo_programacao_excluir(uuid)                from public, anon;
revoke all on function public.rdo_programacao_copiar(date, date, boolean)  from public, anon;
grant execute on function public.rdo_campo_casa(text, text)                to authenticated;
grant execute on function public.rdo_campo_contexto(date, text)            to authenticated;
grant execute on function public.rdo_campo_programados(date)               to authenticated;
grant execute on function public.rdo_programacao_dia(date)                 to authenticated;
grant execute on function public.rdo_programacao_salvar(jsonb)             to authenticated;
grant execute on function public.rdo_programacao_excluir(uuid)             to authenticated;
grant execute on function public.rdo_programacao_copiar(date, date, boolean) to authenticated;
