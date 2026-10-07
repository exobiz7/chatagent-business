begin;

create or replace function private_business_control._require_project_access(p_project_id uuid)
returns table(
  organization_id uuid,
  project_id uuid,
  collaboration_mode text,
  project_profile text,
  policy_revision bigint,
  member_user_id uuid,
  member_role text
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_member record;
  v_project private_business_control.logical_projects%rowtype;
begin
  select * into v_member from private_business_control._current_member();
  select * into v_project
  from private_business_control.logical_projects p
  where p.organization_id=v_member.organization_id and p.id=p_project_id;
  if not found then raise exception 'BUSINESS_PROJECT_NOT_FOUND'; end if;
  if v_project.collaboration_mode='PRIVATE' and not exists(
    select 1 from private_business_control.private_project_members ppm
    where ppm.organization_id=v_member.organization_id
      and ppm.project_id=v_project.id and ppm.user_id=v_member.member_user_id
  ) then raise exception 'BUSINESS_PRIVATE_PROJECT_DENIED'; end if;
  return query select v_member.organization_id,v_project.id,v_project.collaboration_mode,
    v_project.project_profile,v_project.policy_revision,v_member.member_user_id,v_member.member_role;
end;
$$;
revoke all on function private_business_control._require_project_access(uuid) from public,anon,authenticated;

create or replace function public.bc_project_register(
  p_project_key text,p_display_name text,p_operation_id uuid,
  p_project_profile text default 'STANDARD',p_collaboration_mode text default 'TEAM'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_member record; v_op private_business_control.operations%rowtype;
  v_key text; v_name text; v_input jsonb; v_sha text; v_project uuid; v_receipt jsonb; v_org_rev bigint;
begin
  select * into v_member from private_business_control._current_member();
  if v_member.member_role not in ('ADMIN','PM') then raise exception 'BUSINESS_PROJECT_MANAGER_REQUIRED'; end if;
  v_key:=lower(btrim(p_project_key)); v_name:=btrim(p_display_name);
  if p_operation_id is null or v_key !~ '^[a-z0-9][a-z0-9._-]{0,63}$' or length(v_name) not between 1 and 128
     or p_project_profile not in ('READ_ONLY','SAFE','STANDARD') or p_collaboration_mode not in ('TEAM','PRIVATE')
  then raise exception 'BUSINESS_PROJECT_INPUT_INVALID'; end if;
  select policy_revision into v_org_rev from private_business_control.control_state
   where organization_id=v_member.organization_id for update;
  if not found then raise exception 'BUSINESS_CONTROL_STATE_MISSING'; end if;
  v_input:=jsonb_build_object('projectKey',v_key,'displayName',v_name,'projectProfile',p_project_profile,'collaborationMode',p_collaboration_mode);
  v_sha:=private_business_control._control_input_sha256(v_input);
  select * into v_op from private_business_control.operations
   where organization_id=v_member.organization_id and operation_id=p_operation_id;
  if found then
    if v_op.operation_kind<>'project_register' or v_op.input_sha256<>v_sha then raise exception 'BUSINESS_IDEMPOTENCY_CONFLICT'; end if;
    return v_op.receipt;
  end if;
  if exists(select 1 from private_business_control.logical_projects where organization_id=v_member.organization_id and project_key=v_key)
    then raise exception 'BUSINESS_PROJECT_EXISTS'; end if;
  insert into private_business_control.logical_projects(organization_id,project_key,display_name,collaboration_mode,project_profile,created_by_user_id)
  values(v_member.organization_id,v_key,v_name,p_collaboration_mode,p_project_profile,v_member.member_user_id) returning id into v_project;
  if p_collaboration_mode='PRIVATE' then
    insert into private_business_control.private_project_members(organization_id,project_id,user_id,granted_by_user_id)
    values(v_member.organization_id,v_project,v_member.member_user_id,v_member.member_user_id);
  end if;
  update private_business_control.control_state set policy_revision=policy_revision+1,updated_at=now()
   where organization_id=v_member.organization_id returning policy_revision into v_org_rev;
  v_receipt:=jsonb_build_object('projectId',v_project,'projectKey',v_key,'collaborationMode',p_collaboration_mode,
    'projectProfile',p_project_profile,'projectPolicyRevision',1,'organizationPolicyRevision',v_org_rev);
  insert into private_business_control.operations values(v_member.organization_id,p_operation_id,'project_register',v_sha,v_receipt,now());
  return v_receipt;
end; $$;

create or replace function public.bc_project_set_mode(
  p_project_id uuid,p_collaboration_mode text,p_expected_policy_revision bigint,p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_member record; v_op private_business_control.operations%rowtype; v_project private_business_control.logical_projects%rowtype;
  v_input jsonb; v_sha text; v_receipt jsonb; v_org_rev bigint;
begin
  select * into v_member from private_business_control._current_member();
  if v_member.member_role not in ('ADMIN','PM') then raise exception 'BUSINESS_PROJECT_MANAGER_REQUIRED'; end if;
  if p_project_id is null or p_operation_id is null or p_collaboration_mode not in ('TEAM','PRIVATE') or p_expected_policy_revision<1
    then raise exception 'BUSINESS_PROJECT_INPUT_INVALID'; end if;
  select policy_revision into v_org_rev from private_business_control.control_state where organization_id=v_member.organization_id for update;
  v_input:=jsonb_build_object('projectId',p_project_id,'collaborationMode',p_collaboration_mode,'expectedPolicyRevision',p_expected_policy_revision);
  v_sha:=private_business_control._control_input_sha256(v_input);
  select * into v_op from private_business_control.operations where organization_id=v_member.organization_id and operation_id=p_operation_id;
  if found then
    if v_op.operation_kind<>'project_set_mode' or v_op.input_sha256<>v_sha then raise exception 'BUSINESS_IDEMPOTENCY_CONFLICT'; end if;
    return v_op.receipt;
  end if;
  select * into v_project from private_business_control.logical_projects
   where organization_id=v_member.organization_id and id=p_project_id for update;
  if not found then raise exception 'BUSINESS_PROJECT_NOT_FOUND'; end if;
  if v_project.policy_revision<>p_expected_policy_revision then raise exception 'BUSINESS_PROJECT_REVISION_CONFLICT'; end if;
  update private_business_control.logical_projects set collaboration_mode=p_collaboration_mode,
    policy_revision=policy_revision+1,updated_at=now() where id=p_project_id
    returning * into v_project;
  if p_collaboration_mode='PRIVATE' then
    insert into private_business_control.private_project_members(organization_id,project_id,user_id,granted_by_user_id)
    values(v_member.organization_id,p_project_id,v_member.member_user_id,v_member.member_user_id) on conflict do nothing;
  end if;
  update private_business_control.control_state set policy_revision=policy_revision+1,updated_at=now()
   where organization_id=v_member.organization_id returning policy_revision into v_org_rev;
  v_receipt:=jsonb_build_object('projectId',p_project_id,'collaborationMode',p_collaboration_mode,
    'projectPolicyRevision',v_project.policy_revision,'organizationPolicyRevision',v_org_rev);
  insert into private_business_control.operations values(v_member.organization_id,p_operation_id,'project_set_mode',v_sha,v_receipt,now());
  return v_receipt;
end; $$;

create or replace function public.bc_private_member_add(p_project_id uuid,p_user_id uuid,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_member record; v_op private_business_control.operations%rowtype; v_project private_business_control.logical_projects%rowtype;
 v_input jsonb; v_sha text; v_receipt jsonb; v_org_rev bigint;
begin
 select * into v_member from private_business_control._current_member();
 if v_member.member_role not in ('ADMIN','PM') then raise exception 'BUSINESS_PROJECT_MANAGER_REQUIRED'; end if;
 if p_project_id is null or p_user_id is null or p_operation_id is null then raise exception 'BUSINESS_PROJECT_INPUT_INVALID'; end if;
 select policy_revision into v_org_rev from private_business_control.control_state where organization_id=v_member.organization_id for update;
 v_input:=jsonb_build_object('projectId',p_project_id,'userId',p_user_id); v_sha:=private_business_control._control_input_sha256(v_input);
 select * into v_op from private_business_control.operations where organization_id=v_member.organization_id and operation_id=p_operation_id;
 if found then if v_op.operation_kind<>'private_member_add' or v_op.input_sha256<>v_sha then raise exception 'BUSINESS_IDEMPOTENCY_CONFLICT'; end if; return v_op.receipt; end if;
 select * into v_project from private_business_control.logical_projects where organization_id=v_member.organization_id and id=p_project_id for update;
 if not found then raise exception 'BUSINESS_PROJECT_NOT_FOUND'; end if;
 if v_project.collaboration_mode<>'PRIVATE' then raise exception 'BUSINESS_PROJECT_NOT_PRIVATE'; end if;
 if not exists(select 1 from private_business_control.organization_members where organization_id=v_member.organization_id and user_id=p_user_id and member_state='ACTIVE' and revoked_at is null)
  then raise exception 'BUSINESS_TARGET_MEMBER_INVALID'; end if;
 insert into private_business_control.private_project_members(organization_id,project_id,user_id,granted_by_user_id)
 values(v_member.organization_id,p_project_id,p_user_id,v_member.member_user_id) on conflict do nothing;
 update private_business_control.logical_projects set policy_revision=policy_revision+1,updated_at=now() where id=p_project_id returning * into v_project;
 update private_business_control.control_state set policy_revision=policy_revision+1,updated_at=now() where organization_id=v_member.organization_id returning policy_revision into v_org_rev;
 v_receipt:=jsonb_build_object('projectId',p_project_id,'userId',p_user_id,'memberPresent',true,'projectPolicyRevision',v_project.policy_revision,'organizationPolicyRevision',v_org_rev);
 insert into private_business_control.operations values(v_member.organization_id,p_operation_id,'private_member_add',v_sha,v_receipt,now()); return v_receipt;
end; $$;

create or replace function public.bc_private_member_remove(p_project_id uuid,p_user_id uuid,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_member record; v_op private_business_control.operations%rowtype; v_project private_business_control.logical_projects%rowtype;
 v_input jsonb; v_sha text; v_receipt jsonb; v_org_rev bigint; v_remaining integer;
begin
 select * into v_member from private_business_control._current_member();
 if v_member.member_role not in ('ADMIN','PM') then raise exception 'BUSINESS_PROJECT_MANAGER_REQUIRED'; end if;
 if p_project_id is null or p_user_id is null or p_operation_id is null then raise exception 'BUSINESS_PROJECT_INPUT_INVALID'; end if;
 select policy_revision into v_org_rev from private_business_control.control_state where organization_id=v_member.organization_id for update;
 v_input:=jsonb_build_object('projectId',p_project_id,'userId',p_user_id); v_sha:=private_business_control._control_input_sha256(v_input);
 select * into v_op from private_business_control.operations where organization_id=v_member.organization_id and operation_id=p_operation_id;
 if found then if v_op.operation_kind<>'private_member_remove' or v_op.input_sha256<>v_sha then raise exception 'BUSINESS_IDEMPOTENCY_CONFLICT'; end if; return v_op.receipt; end if;
 select * into v_project from private_business_control.logical_projects where organization_id=v_member.organization_id and id=p_project_id for update;
 if not found then raise exception 'BUSINESS_PROJECT_NOT_FOUND'; end if;
 if v_project.collaboration_mode<>'PRIVATE' then raise exception 'BUSINESS_PROJECT_NOT_PRIVATE'; end if;
 delete from private_business_control.private_project_members where organization_id=v_member.organization_id and project_id=p_project_id and user_id=p_user_id;
 select count(*) into v_remaining from private_business_control.private_project_members where organization_id=v_member.organization_id and project_id=p_project_id;
 if v_remaining=0 then raise exception 'BUSINESS_PRIVATE_PROJECT_REQUIRES_MEMBER'; end if;
 update private_business_control.logical_projects set policy_revision=policy_revision+1,updated_at=now() where id=p_project_id returning * into v_project;
 update private_business_control.control_state set policy_revision=policy_revision+1,updated_at=now() where organization_id=v_member.organization_id returning policy_revision into v_org_rev;
 v_receipt:=jsonb_build_object('projectId',p_project_id,'userId',p_user_id,'memberPresent',false,'projectPolicyRevision',v_project.policy_revision,'organizationPolicyRevision',v_org_rev);
 insert into private_business_control.operations values(v_member.organization_id,p_operation_id,'private_member_remove',v_sha,v_receipt,now()); return v_receipt;
end; $$;

revoke all on function public.bc_project_register(text,text,uuid,text,text) from public,anon;
revoke all on function public.bc_project_set_mode(uuid,text,bigint,uuid) from public,anon;
revoke all on function public.bc_private_member_add(uuid,uuid,uuid) from public,anon;
revoke all on function public.bc_private_member_remove(uuid,uuid,uuid) from public,anon;
grant execute on function public.bc_project_register(text,text,uuid,text,text) to authenticated;
grant execute on function public.bc_project_set_mode(uuid,text,bigint,uuid) to authenticated;
grant execute on function public.bc_private_member_add(uuid,uuid,uuid) to authenticated;
grant execute on function public.bc_private_member_remove(uuid,uuid,uuid) to authenticated;

commit;
