begin;

create unique index if not exists runtime_sessions_org_node_user_uidx
  on private_business_control.runtime_sessions(organization_id,runtime_node_id,user_id);

create or replace function private_business_control._control_input_sha256(p_input jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(p_input::text,'UTF8'),'sha256'),'hex');
$$;

revoke all on function private_business_control._control_input_sha256(jsonb) from public, anon, authenticated;

create or replace function public.bc_runtime_enroll(
  p_node_id uuid,
  p_node_name text,
  p_node_type text,
  p_operation_id uuid,
  p_approve boolean default false,
  p_shared_host_power_enabled boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member record;
  v_node private_business_control.runtime_nodes%rowtype;
  v_existing_operation private_business_control.operations%rowtype;
  v_policy_revision bigint;
  v_input jsonb;
  v_input_sha text;
  v_receipt jsonb;
  v_normalized_name text;
  v_transitioned boolean := false;
begin
  select * into v_member from private_business_control._current_member();

  v_normalized_name := btrim(p_node_name);
  if p_node_id is null or p_operation_id is null or
     v_normalized_name is null or length(v_normalized_name) < 1 or length(v_normalized_name) > 128 or
     p_node_type not in ('PERSONAL_NODE','SHARED_NODE') then
    raise exception 'BUSINESS_RUNTIME_INPUT_INVALID';
  end if;

  if p_node_type='SHARED_NODE' and v_member.member_role <> 'ADMIN' then
    raise exception 'BUSINESS_ADMIN_REQUIRED';
  end if;
  if p_approve and v_member.member_role <> 'ADMIN' then
    raise exception 'BUSINESS_ADMIN_REQUIRED';
  end if;
  if p_shared_host_power_enabled and
     not (p_approve and p_node_type='SHARED_NODE' and v_member.member_role='ADMIN') then
    raise exception 'BUSINESS_SHARED_HOST_POWER_INVALID';
  end if;

  select policy_revision into v_policy_revision
  from private_business_control.control_state
  where organization_id=v_member.organization_id
  for update;
  if not found then raise exception 'BUSINESS_CONTROL_STATE_MISSING'; end if;

  v_input := jsonb_build_object(
    'nodeId',p_node_id::text,
    'nodeName',v_normalized_name,
    'nodeType',p_node_type,
    'approve',p_approve,
    'sharedHostPowerEnabled',p_shared_host_power_enabled
  );
  v_input_sha := private_business_control._control_input_sha256(v_input);

  select * into v_existing_operation
  from private_business_control.operations
  where organization_id=v_member.organization_id and operation_id=p_operation_id;
  if found then
    if v_existing_operation.operation_kind <> 'runtime_enroll' or
       v_existing_operation.input_sha256 <> v_input_sha then
      raise exception 'BUSINESS_IDEMPOTENCY_CONFLICT';
    end if;
    return v_existing_operation.receipt;
  end if;

  select * into v_node
  from private_business_control.runtime_nodes
  where organization_id=v_member.organization_id and id=p_node_id
  for update;

  if not found then
    insert into private_business_control.runtime_nodes(
      id,organization_id,node_name,node_type,lifecycle,owner_user_id,
      shared_host_power_enabled,enrolled_by_user_id
    ) values (
      p_node_id,v_member.organization_id,v_normalized_name,p_node_type,'PENDING',
      case when p_node_type='PERSONAL_NODE' then v_member.member_user_id else null end,
      false,v_member.member_user_id
    ) returning * into v_node;
  else
    if v_node.node_name <> v_normalized_name or v_node.node_type <> p_node_type then
      raise exception 'BUSINESS_RUNTIME_NODE_ID_CONFLICT';
    end if;
    if v_node.lifecycle='REVOKED' then
      raise exception 'BUSINESS_RUNTIME_NODE_REVOKED';
    end if;
    if v_node.node_type='PERSONAL_NODE' and not p_approve and
       v_node.owner_user_id <> v_member.member_user_id then
      raise exception 'BUSINESS_PERSONAL_NODE_OWNER_MISMATCH';
    end if;
    if v_node.node_type='SHARED_NODE' and v_member.member_role <> 'ADMIN' then
      raise exception 'BUSINESS_ADMIN_REQUIRED';
    end if;
  end if;

  if p_approve then
    if v_node.lifecycle='APPROVED' then
      if v_node.shared_host_power_enabled <> p_shared_host_power_enabled then
        raise exception 'BUSINESS_RUNTIME_ALREADY_APPROVED';
      end if;
    else
      update private_business_control.runtime_nodes
      set lifecycle='APPROVED',
          approved_by_user_id=v_member.member_user_id,
          approved_at=now(),
          shared_host_power_enabled=case when node_type='SHARED_NODE' then p_shared_host_power_enabled else false end
      where organization_id=v_member.organization_id and id=p_node_id
      returning * into v_node;
      update private_business_control.control_state
      set policy_revision=policy_revision+1,updated_at=now()
      where organization_id=v_member.organization_id
      returning policy_revision into v_policy_revision;
      v_transitioned := true;
    end if;
  end if;

  v_receipt := jsonb_build_object(
    'nodeId',v_node.id,
    'nodeName',v_node.node_name,
    'nodeType',v_node.node_type,
    'lifecycle',v_node.lifecycle,
    'ownedByCaller',v_node.node_type='PERSONAL_NODE' and v_node.owner_user_id=v_member.member_user_id,
    'sharedHostPowerEnabled',v_node.shared_host_power_enabled,
    'approvalTransitioned',v_transitioned,
    'policyRevision',v_policy_revision
  );

  insert into private_business_control.operations(
    organization_id,operation_id,operation_kind,input_sha256,receipt
  ) values (
    v_member.organization_id,p_operation_id,'runtime_enroll',v_input_sha,v_receipt
  );

  return v_receipt;
end;
$$;

create or replace function public.bc_runtime_status(p_node_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member record;
  v_node private_business_control.runtime_nodes%rowtype;
  v_policy_revision bigint;
  v_lease_seconds integer;
  v_lease_expires_at timestamptz;
  v_can_route boolean := false;
begin
  select * into v_member from private_business_control._current_member();
  if p_node_id is null then raise exception 'BUSINESS_RUNTIME_INPUT_INVALID'; end if;

  select * into v_node
  from private_business_control.runtime_nodes
  where organization_id=v_member.organization_id and id=p_node_id;
  if not found then raise exception 'BUSINESS_RUNTIME_NODE_NOT_FOUND'; end if;

  if v_node.node_type='PERSONAL_NODE' then
    if v_node.owner_user_id=v_member.member_user_id then
      v_can_route := v_node.lifecycle='APPROVED';
    elsif v_member.member_role <> 'ADMIN' then
      raise exception 'BUSINESS_RUNTIME_NODE_DENIED';
    end if;
  else
    if v_node.lifecycle='APPROVED' then
      v_can_route := true;
    elsif v_member.member_role <> 'ADMIN' then
      raise exception 'BUSINESS_RUNTIME_NODE_DENIED';
    end if;
  end if;

  select policy_revision,authorization_lease_seconds
    into v_policy_revision,v_lease_seconds
  from private_business_control.control_state
  where organization_id=v_member.organization_id;
  if not found then raise exception 'BUSINESS_CONTROL_STATE_MISSING'; end if;

  if v_can_route then
    v_lease_expires_at := now() + make_interval(secs=>v_lease_seconds);
    insert into private_business_control.runtime_sessions(
      organization_id,runtime_node_id,user_id,session_state,lease_expires_at,last_seen_at,revoked_at
    ) values (
      v_member.organization_id,p_node_id,v_member.member_user_id,'ACTIVE',v_lease_expires_at,now(),null
    )
    on conflict (organization_id,runtime_node_id,user_id) do update
      set session_state='ACTIVE',lease_expires_at=excluded.lease_expires_at,
          last_seen_at=excluded.last_seen_at,revoked_at=null;

    update private_business_control.runtime_nodes
    set last_seen_at=now()
    where organization_id=v_member.organization_id and id=p_node_id
    returning * into v_node;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'nodeId',v_node.id,
    'nodeName',v_node.node_name,
    'nodeType',v_node.node_type,
    'lifecycle',v_node.lifecycle,
    'ownedByCaller',v_node.node_type='PERSONAL_NODE' and v_node.owner_user_id=v_member.member_user_id,
    'sharedHostPowerEnabled',v_node.shared_host_power_enabled,
    'authorizationLeaseSeconds',v_lease_seconds,
    'leaseExpiresAt',v_lease_expires_at,
    'policyRevision',v_policy_revision
  ));
end;
$$;

create or replace function public.bc_runtime_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member record;
  v_nodes jsonb;
begin
  select * into v_member from private_business_control._current_member();

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'nodeId',n.id,
    'nodeName',n.node_name,
    'nodeType',n.node_type,
    'lifecycle',n.lifecycle,
    'ownedByCaller',n.node_type='PERSONAL_NODE' and n.owner_user_id=v_member.member_user_id,
    'sharedHostPowerEnabled',n.shared_host_power_enabled,
    'lastSeenAt',n.last_seen_at,
    'leaseExpiresAt',s.lease_expires_at
  )) order by n.node_name,n.id),'[]'::jsonb)
  into v_nodes
  from private_business_control.runtime_nodes n
  left join private_business_control.runtime_sessions s
    on s.organization_id=n.organization_id and s.runtime_node_id=n.id
   and s.user_id=v_member.member_user_id and s.session_state='ACTIVE'
  where n.organization_id=v_member.organization_id
    and n.lifecycle='APPROVED'
    and ((n.node_type='PERSONAL_NODE' and n.owner_user_id=v_member.member_user_id)
      or n.node_type='SHARED_NODE');

  return jsonb_build_object('nodes',v_nodes,'count',jsonb_array_length(v_nodes));
end;
$$;

create or replace function public.bc_runtime_revoke(
  p_node_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member record;
  v_node private_business_control.runtime_nodes%rowtype;
  v_existing_operation private_business_control.operations%rowtype;
  v_policy_revision bigint;
  v_input jsonb;
  v_input_sha text;
  v_receipt jsonb;
  v_transitioned boolean := false;
begin
  select * into v_member from private_business_control._current_member();
  if v_member.member_role <> 'ADMIN' then raise exception 'BUSINESS_ADMIN_REQUIRED'; end if;
  if p_node_id is null or p_operation_id is null then raise exception 'BUSINESS_RUNTIME_INPUT_INVALID'; end if;

  select policy_revision into v_policy_revision
  from private_business_control.control_state
  where organization_id=v_member.organization_id
  for update;
  if not found then raise exception 'BUSINESS_CONTROL_STATE_MISSING'; end if;

  v_input := jsonb_build_object('nodeId',p_node_id::text);
  v_input_sha := private_business_control._control_input_sha256(v_input);

  select * into v_existing_operation
  from private_business_control.operations
  where organization_id=v_member.organization_id and operation_id=p_operation_id;
  if found then
    if v_existing_operation.operation_kind <> 'runtime_revoke' or
       v_existing_operation.input_sha256 <> v_input_sha then
      raise exception 'BUSINESS_IDEMPOTENCY_CONFLICT';
    end if;
    return v_existing_operation.receipt;
  end if;

  select * into v_node
  from private_business_control.runtime_nodes
  where organization_id=v_member.organization_id and id=p_node_id
  for update;
  if not found then raise exception 'BUSINESS_RUNTIME_NODE_NOT_FOUND'; end if;

  if v_node.lifecycle <> 'REVOKED' then
    update private_business_control.runtime_nodes
    set lifecycle='REVOKED',revoked_by_user_id=v_member.member_user_id,revoked_at=now()
    where organization_id=v_member.organization_id and id=p_node_id
    returning * into v_node;

    update private_business_control.runtime_sessions
    set session_state='REVOKED',revoked_at=now()
    where organization_id=v_member.organization_id and runtime_node_id=p_node_id
      and session_state<>'REVOKED';

    update private_business_control.control_state
    set policy_revision=policy_revision+1,updated_at=now()
    where organization_id=v_member.organization_id
    returning policy_revision into v_policy_revision;
    v_transitioned := true;
  end if;

  v_receipt := jsonb_build_object(
    'nodeId',v_node.id,
    'nodeType',v_node.node_type,
    'lifecycle',v_node.lifecycle,
    'revocationTransitioned',v_transitioned,
    'policyRevision',v_policy_revision
  );

  insert into private_business_control.operations(
    organization_id,operation_id,operation_kind,input_sha256,receipt
  ) values (
    v_member.organization_id,p_operation_id,'runtime_revoke',v_input_sha,v_receipt
  );

  return v_receipt;
end;
$$;

revoke all on function public.bc_runtime_enroll(uuid,text,text,uuid,boolean,boolean) from public, anon;
revoke all on function public.bc_runtime_status(uuid) from public, anon;
revoke all on function public.bc_runtime_list() from public, anon;
revoke all on function public.bc_runtime_revoke(uuid,uuid) from public, anon;

grant execute on function public.bc_runtime_enroll(uuid,text,text,uuid,boolean,boolean) to authenticated;
grant execute on function public.bc_runtime_status(uuid) to authenticated;
grant execute on function public.bc_runtime_list() to authenticated;
grant execute on function public.bc_runtime_revoke(uuid,uuid) to authenticated;

commit;
