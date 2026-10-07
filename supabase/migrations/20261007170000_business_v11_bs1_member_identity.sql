begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function private_business_control._current_member()
returns table(
  organization_id uuid,
  organization_slug text,
  organization_display_name text,
  member_user_id uuid,
  member_role text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_org uuid;
  v_slug text;
  v_org_name text;
  v_role text;
  v_state text;
  v_revoked timestamptz;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'BUSINESS_AUTH_REQUIRED';
  end if;

  select m.organization_id, o.slug, o.display_name, m.role, m.member_state, m.revoked_at
    into v_org, v_slug, v_org_name, v_role, v_state, v_revoked
  from private_business_control.organization_members m
  join private_business_control.organizations o on o.id = m.organization_id
  where m.user_id = v_user;

  if not found then
    raise exception 'BUSINESS_MEMBER_NOT_FOUND';
  end if;

  if v_state <> 'ACTIVE' or v_revoked is not null then
    raise exception 'BUSINESS_MEMBER_REVOKED';
  end if;

  return query select v_org, v_slug, v_org_name, v_user, v_role;
end;
$$;

create or replace function public.bc_member_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member record;
  v_email text;
  v_auth_name text;
  v_profile_id text;
begin
  select * into v_member from private_business_control._current_member();

  select u.email, nullif(btrim(u.raw_user_meta_data ->> 'name'), '')
    into v_email, v_auth_name
  from auth.users u
  where u.id = v_member.member_user_id;

  v_profile_id := 'prf_' || substr(
    encode(
      extensions.digest(
        convert_to(v_member.organization_slug, 'UTF8') ||
        decode('00', 'hex') ||
        convert_to(v_member.member_user_id::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    ),
    1,
    32
  );

  return jsonb_strip_nulls(jsonb_build_object(
    'id', v_profile_id,
    'name', v_auth_name,
    'email', v_email,
    'nickname', 'ChatAgent Business'
  ));
end;
$$;

create or replace function public.bc_schema_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member record;
  v_schema integer;
  v_contract integer;
begin
  select * into v_member from private_business_control._current_member();

  select schema_version, contract_version
    into v_schema, v_contract
  from private_business_control.schema_meta
  where singleton = true;

  return jsonb_build_object(
    'schema', 'private_business_control',
    'schemaVersion', v_schema,
    'contractVersion', v_contract,
    'organizationInitialized', true,
    'organizationSlug', v_member.organization_slug,
    'role', v_member.member_role,
    'tableCount', 9
  );
end;
$$;

revoke all on function private_business_control._current_member() from public, anon, authenticated;
revoke all on function public.bc_member_profile() from public, anon;
revoke all on function public.bc_schema_status() from public, anon;

grant execute on function public.bc_member_profile() to authenticated;
grant execute on function public.bc_schema_status() to authenticated;

commit;
