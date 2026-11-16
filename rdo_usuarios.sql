-- ============================================================================
--  SISTEMA RDO · ABA USUÁRIOS (complemento do rdo_campo.sql)
--  Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run.
--  Pode rodar de novo sem problema. Já está incluído no rdo_campo.sql; este
--  arquivo existe só para não precisar rodar o outro inteiro de novo.
-- ============================================================================

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
