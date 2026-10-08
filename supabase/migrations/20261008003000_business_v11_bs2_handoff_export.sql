begin;

create or replace function private_business_continuity._tail_integrity_verified(p_organization_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare
  v_seq bigint; v_head text; v_count bigint; v_max bigint; v_tail text;
begin
  select context_seq,head_sha256 into v_seq,v_head
  from private_business_continuity.continuity_state where organization_id=p_organization_id;
  if not found then return true; end if;
  select count(*),coalesce(max(seq),0) into v_count,v_max
  from private_business_continuity.events where organization_id=p_organization_id;
  if v_seq=0 then return v_count=0 and v_head=repeat('0',64); end if;
  if v_count<>v_seq or v_max<>v_seq then return false; end if;
  select event_sha256 into v_tail from private_business_continuity.events
  where organization_id=p_organization_id and seq=v_seq;
  return v_tail is not null and v_tail=v_head;
end; $$;
revoke all on function private_business_continuity._tail_integrity_verified(uuid) from public,anon,authenticated;

create or replace function private_business_continuity._event_chain_verified(p_organization_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare
  v_event record; v_prev text:=repeat('0',64); v_expected bigint:=1; v_hash text;
  v_state private_business_continuity.continuity_state%rowtype;
begin
  for v_event in
    select * from private_business_continuity.events
    where organization_id=p_organization_id order by seq
  loop
    if v_event.seq<>v_expected or v_event.previous_sha256<>v_prev then return false; end if;
    v_hash:=private_business_continuity._input_sha256(jsonb_build_object(
      'seq',v_event.seq,'eventKind',v_event.event_kind,'projectId',v_event.project_id,
      'taskId',v_event.task_id,'checkpointId',v_event.checkpoint_id,'actorUserId',v_event.actor_user_id,
      'payloadSha256',v_event.payload_sha256,'previousSha256',v_event.previous_sha256));
    if v_hash<>v_event.event_sha256 then return false; end if;
    v_prev:=v_event.event_sha256; v_expected:=v_expected+1;
  end loop;
  select * into v_state from private_business_continuity.continuity_state where organization_id=p_organization_id;
  if not found then return v_expected=1; end if;
  return v_state.context_seq=v_expected-1 and v_state.head_sha256=v_prev;
end; $$;
revoke all on function private_business_continuity._event_chain_verified(uuid) from public,anon,authenticated;

create or replace function public.bc_task_get(p_project_id uuid,p_task_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_access record; v_task private_business_continuity.tasks%rowtype; v_checkpoints jsonb;
  v_seq bigint:=0; v_integrity boolean;
begin
  select * into v_access from private_business_control._require_project_access(p_project_id);
  select * into v_task from private_business_continuity.tasks
  where organization_id=v_access.organization_id and project_id=p_project_id and id=p_task_id;
  if not found then raise exception 'BUSINESS_TASK_NOT_FOUND'; end if;
  select coalesce(context_seq,0) into v_seq from private_business_continuity.continuity_state
   where organization_id=v_access.organization_id;
  v_integrity:=private_business_continuity._tail_integrity_verified(v_access.organization_id);
  with latest as (
    select c.* from private_business_continuity.checkpoints c
    where c.organization_id=v_access.organization_id and c.task_id=p_task_id
    order by c.task_revision desc limit 5
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'checkpointId',c.id,'revision',c.task_revision,'summary',c.summary,'currentState',c.current_state,
    'nextActions',c.next_actions,'verification',c.verification,'decisions',c.decisions,'facts',c.facts,
    'artifacts',c.artifacts,'createdAt',c.created_at) order by c.task_revision),'[]'::jsonb)
  into v_checkpoints from latest c;
  return jsonb_build_object(
    'contextSeq',v_seq,'integrityVerified',v_integrity,
    'task',jsonb_build_object('taskId',v_task.id,'projectId',v_task.project_id,'objective',v_task.objective,
      'status',v_task.status,'revision',v_task.revision,'createdByUserId',v_task.created_by_user_id,
      'assignedToUserId',v_task.assigned_to_user_id,'tags',v_task.tags,'startedAt',v_task.started_at,
      'completedAt',v_task.completed_at),
    'checkpoints',v_checkpoints);
end; $$;

create or replace function public.bc_project_context(p_project_id uuid,p_limit integer default 10)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_access record; v_seq bigint:=0; v_tasks jsonb; v_integrity boolean;
begin
  select * into v_access from private_business_control._require_project_access(p_project_id);
  if p_limit is null or p_limit<1 or p_limit>20 then raise exception 'BUSINESS_CONTINUITY_INPUT_INVALID'; end if;
  select coalesce(context_seq,0) into v_seq from private_business_continuity.continuity_state where organization_id=v_access.organization_id;
  v_integrity:=private_business_continuity._tail_integrity_verified(v_access.organization_id);
  with selected as (
    select t.* from private_business_continuity.tasks t
    where t.organization_id=v_access.organization_id and t.project_id=p_project_id
    order by (t.status='ACTIVE') desc,coalesce(t.completed_at,t.started_at) desc,t.started_at desc
    limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'taskId',s.id,'objective',s.objective,'status',s.status,'revision',s.revision,'assignedToUserId',s.assigned_to_user_id,
    'tags',s.tags,'startedAt',s.started_at,'completedAt',s.completed_at,
    'latestCheckpoint',(select jsonb_build_object('checkpointId',c.id,'revision',c.task_revision,'summary',c.summary,
      'currentState',c.current_state,'nextActions',c.next_actions,'verification',c.verification,'decisions',c.decisions,
      'facts',c.facts,'artifacts',c.artifacts,'createdAt',c.created_at)
      from private_business_continuity.checkpoints c where c.organization_id=v_access.organization_id and c.task_id=s.id
      order by c.task_revision desc limit 1)
    ) order by (s.status='ACTIVE') desc,coalesce(s.completed_at,s.started_at) desc,s.started_at desc),'[]'::jsonb)
  into v_tasks from selected s;
  return jsonb_build_object('projectId',p_project_id,'collaborationMode',v_access.collaboration_mode,
    'projectProfile',v_access.project_profile,'projectPolicyRevision',v_access.policy_revision,
    'contextSeq',coalesce(v_seq,0),'integrityVerified',v_integrity,'tasks',v_tasks);
end; $$;

create or replace function public.bc_export_snapshot(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_access record; v_project private_business_control.logical_projects%rowtype;
  v_tasks jsonb; v_checkpoints jsonb; v_operations jsonb; v_events jsonb;
  v_payload jsonb; v_counts jsonb; v_project_high bigint:=0; v_org_seq bigint:=0; v_digest text;
begin
  select * into v_access from private_business_control._require_project_access(p_project_id);
  if not private_business_continuity._event_chain_verified(v_access.organization_id)
    then raise exception 'BUSINESS_CONTINUITY_INTEGRITY_UNVERIFIED'; end if;
  select * into v_project from private_business_control.logical_projects
   where organization_id=v_access.organization_id and id=p_project_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'taskId',t.id,'objective',t.objective,'status',t.status,'revision',t.revision,
    'createdByUserId',t.created_by_user_id,'assignedToUserId',t.assigned_to_user_id,'tags',t.tags,
    'startedAt',t.started_at,'completedAt',t.completed_at,'completedByUserId',t.completed_by_user_id)
    order by t.started_at,t.id),'[]'::jsonb)
  into v_tasks from private_business_continuity.tasks t
  where t.organization_id=v_access.organization_id and t.project_id=p_project_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'checkpointId',c.id,'taskId',c.task_id,'revision',c.task_revision,'summary',c.summary,
    'currentState',c.current_state,'nextActions',c.next_actions,'verification',c.verification,
    'decisions',c.decisions,'facts',c.facts,'artifacts',c.artifacts,'sourceUserId',c.source_user_id,
    'sourceRuntimeNodeId',c.source_runtime_node_id,'createdAt',c.created_at)
    order by c.created_at,c.id),'[]'::jsonb)
  into v_checkpoints from private_business_continuity.checkpoints c
  where c.organization_id=v_access.organization_id and c.project_id=p_project_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'operationId',o.operation_id,'operationKind',o.operation_kind,'inputSha256',o.input_sha256,
    'receipt',o.receipt,'createdAt',o.created_at) order by o.created_at,o.operation_id),'[]'::jsonb)
  into v_operations from private_business_continuity.operations o
  where o.organization_id=v_access.organization_id and (
    o.receipt->>'projectId'=p_project_id::text or
    o.receipt->>'taskId' in (select t.id::text from private_business_continuity.tasks t
      where t.organization_id=v_access.organization_id and t.project_id=p_project_id)
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'seq',e.seq,'eventKind',e.event_kind,'taskId',e.task_id,'checkpointId',e.checkpoint_id,
    'actorUserId',e.actor_user_id,'payloadSha256',e.payload_sha256,'previousSha256',e.previous_sha256,
    'eventSha256',e.event_sha256,'createdAt',e.created_at) order by e.seq),'[]'::jsonb),coalesce(max(e.seq),0)
  into v_events,v_project_high from private_business_continuity.events e
  where e.organization_id=v_access.organization_id and e.project_id=p_project_id;

  select coalesce(context_seq,0) into v_org_seq from private_business_continuity.continuity_state
   where organization_id=v_access.organization_id;
  v_counts:=jsonb_build_object('tasks',jsonb_array_length(v_tasks),'checkpoints',jsonb_array_length(v_checkpoints),
    'operations',jsonb_array_length(v_operations),'events',jsonb_array_length(v_events));
  v_payload:=jsonb_build_object(
    'schemaVersion',1,'contractVersion',1,'visibilityScope','CALLER_AUTHORIZED_PROJECT',
    'project',jsonb_build_object('projectId',v_project.id,'projectKey',v_project.project_key,
      'displayName',v_project.display_name,'collaborationMode',v_project.collaboration_mode,
      'projectProfile',v_project.project_profile,'policyRevision',v_project.policy_revision),
    'projectEventHighWatermark',v_project_high,'counts',v_counts,
    'tasks',v_tasks,'checkpoints',v_checkpoints,'operations',v_operations,'events',v_events);
  v_digest:='sha256:'||private_business_continuity._input_sha256(v_payload);
  return v_payload||jsonb_build_object('organizationContextSeq',v_org_seq,'exportedAt',now(),
    'integrityVerified',true,'logicalDigest',v_digest);
end; $$;

revoke all on function public.bc_export_snapshot(uuid) from public,anon;
grant execute on function public.bc_export_snapshot(uuid) to authenticated;

-- bc_import_snapshot intentionally remains absent from the authenticated runtime surface.
-- Accepted Design assigns the one-time importer/rehearsal and retirement to B-S4 migration work.

commit;
