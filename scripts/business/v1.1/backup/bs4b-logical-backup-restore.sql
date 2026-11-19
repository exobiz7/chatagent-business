begin;

create or replace function private_business_continuity._backup_export(p_organization_slug text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_org uuid; v_seq bigint:=0; v_head text:=repeat('0',64);
  v_projects jsonb; v_private jsonb; v_tasks jsonb; v_checkpoints jsonb; v_operations jsonb; v_events jsonb;
begin
  if p_organization_slug is null or p_organization_slug !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
    then raise exception 'BUSINESS_BACKUP_ORGANIZATION_INVALID'; end if;
  select id into v_org from private_business_control.organizations where slug=p_organization_slug;
  if not found then raise exception 'BUSINESS_BACKUP_ORGANIZATION_NOT_FOUND'; end if;
  if not private_business_continuity._event_chain_verified(v_org)
    then raise exception 'BUSINESS_BACKUP_SOURCE_INTEGRITY_UNVERIFIED'; end if;
  select context_seq,head_sha256 into v_seq,v_head from private_business_continuity.continuity_state where organization_id=v_org;
  v_seq:=coalesce(v_seq,0); v_head:=coalesce(v_head,repeat('0',64));

  select coalesce(jsonb_agg(jsonb_build_object(
    'projectId',p.id,'projectKey',p.project_key,'displayName',p.display_name,'collaborationMode',p.collaboration_mode,
    'projectProfile',p.project_profile,'policyRevision',p.policy_revision,'createdByUserId',p.created_by_user_id,
    'createdAt',p.created_at,'updatedAt',p.updated_at) order by p.project_key,p.id),'[]'::jsonb)
  into v_projects from private_business_control.logical_projects p where p.organization_id=v_org;

  select coalesce(jsonb_agg(jsonb_build_object(
    'projectId',m.project_id,'userId',m.user_id,'grantedByUserId',m.granted_by_user_id,'grantedAt',m.granted_at)
    order by m.project_id,m.user_id),'[]'::jsonb)
  into v_private from private_business_control.private_project_members m where m.organization_id=v_org;

  select coalesce(jsonb_agg(jsonb_build_object(
    'taskId',t.id,'projectId',t.project_id,'objective',t.objective,'status',t.status,'revision',t.revision,
    'createdByUserId',t.created_by_user_id,'assignedToUserId',t.assigned_to_user_id,'tags',t.tags,
    'startedAt',t.started_at,'completedAt',t.completed_at,'completedByUserId',t.completed_by_user_id)
    order by t.started_at,t.id),'[]'::jsonb)
  into v_tasks from private_business_continuity.tasks t where t.organization_id=v_org;

  select coalesce(jsonb_agg(jsonb_build_object(
    'checkpointId',c.id,'projectId',c.project_id,'taskId',c.task_id,'revision',c.task_revision,
    'summary',c.summary,'currentState',c.current_state,'nextActions',c.next_actions,'verification',c.verification,
    'decisions',c.decisions,'facts',c.facts,'artifacts',c.artifacts,'sourceUserId',c.source_user_id,
    'sourceRuntimeNodeId',c.source_runtime_node_id,'createdAt',c.created_at)
    order by c.created_at,c.id),'[]'::jsonb)
  into v_checkpoints from private_business_continuity.checkpoints c where c.organization_id=v_org;

  select coalesce(jsonb_agg(jsonb_build_object(
    'operationId',o.operation_id,'operationKind',o.operation_kind,'inputSha256',o.input_sha256,'receipt',o.receipt,'createdAt',o.created_at)
    order by o.created_at,o.operation_id),'[]'::jsonb)
  into v_operations from private_business_continuity.operations o where o.organization_id=v_org;

  select coalesce(jsonb_agg(jsonb_build_object(
    'seq',e.seq,'eventKind',e.event_kind,'projectId',e.project_id,'taskId',e.task_id,'checkpointId',e.checkpoint_id,
    'actorUserId',e.actor_user_id,'payloadSha256',e.payload_sha256,'previousSha256',e.previous_sha256,
    'eventSha256',e.event_sha256,'createdAt',e.created_at) order by e.seq),'[]'::jsonb)
  into v_events from private_business_continuity.events e where e.organization_id=v_org;

  return jsonb_build_object(
    'format','chatagent-business-continuity-logical-v1','schemaVersion',1,'contractVersion',1,
    'organizationSlug',p_organization_slug,'contextSeq',v_seq,'headSha256',v_head,
    'projects',v_projects,'privateProjectMembers',v_private,'tasks',v_tasks,'checkpoints',v_checkpoints,
    'operations',v_operations,'events',v_events,
    'counts',jsonb_build_object('projects',jsonb_array_length(v_projects),'privateProjectMembers',jsonb_array_length(v_private),
      'tasks',jsonb_array_length(v_tasks),'checkpoints',jsonb_array_length(v_checkpoints),
      'operations',jsonb_array_length(v_operations),'events',jsonb_array_length(v_events)));
end; $$;
revoke all on function private_business_continuity._backup_export(text) from public,anon,authenticated;

create or replace function private_business_continuity._restore_empty(p_snapshot jsonb,p_restore_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_org uuid; v_slug text; v_project jsonb; v_member jsonb; v_task jsonb; v_cp jsonb; v_op jsonb; v_event jsonb;
  v_counts jsonb; v_projects integer; v_private integer; v_tasks integer; v_checkpoints integer; v_operations integer; v_events integer;
  v_user uuid; v_node uuid; v_seq bigint; v_head text;
begin
  if p_snapshot is null or p_restore_actor_user_id is null or p_snapshot->>'format'<>'chatagent-business-continuity-logical-v1'
     or (p_snapshot->>'schemaVersion')::integer<>1 or (p_snapshot->>'contractVersion')::integer<>1
  then raise exception 'BUSINESS_RESTORE_SNAPSHOT_INVALID'; end if;
  v_slug:=p_snapshot->>'organizationSlug';
  if v_slug is null or v_slug !~ '^[a-z0-9][a-z0-9._-]{0,63}$' then raise exception 'BUSINESS_RESTORE_SNAPSHOT_INVALID'; end if;
  select id into v_org from private_business_control.organizations where slug=v_slug;
  if not found then raise exception 'BUSINESS_RESTORE_ORGANIZATION_MISMATCH'; end if;
  if not exists(select 1 from private_business_control.organization_members where organization_id=v_org and user_id=p_restore_actor_user_id
      and role='ADMIN' and member_state='ACTIVE' and revoked_at is null)
  then raise exception 'BUSINESS_RESTORE_ADMIN_REQUIRED'; end if;
  if exists(select 1 from private_business_control.logical_projects where organization_id=v_org)
     or exists(select 1 from private_business_control.private_project_members where organization_id=v_org)
     or exists(select 1 from private_business_continuity.continuity_state where organization_id=v_org)
     or exists(select 1 from private_business_continuity.tasks where organization_id=v_org)
     or exists(select 1 from private_business_continuity.checkpoints where organization_id=v_org)
     or exists(select 1 from private_business_continuity.operations where organization_id=v_org)
     or exists(select 1 from private_business_continuity.events where organization_id=v_org)
  then raise exception 'BUSINESS_RESTORE_TARGET_NOT_EMPTY'; end if;
  if jsonb_typeof(p_snapshot->'projects')<>'array' or jsonb_typeof(p_snapshot->'privateProjectMembers')<>'array'
     or jsonb_typeof(p_snapshot->'tasks')<>'array' or jsonb_typeof(p_snapshot->'checkpoints')<>'array'
     or jsonb_typeof(p_snapshot->'operations')<>'array' or jsonb_typeof(p_snapshot->'events')<>'array'
     or jsonb_typeof(p_snapshot->'counts')<>'object' then raise exception 'BUSINESS_RESTORE_SNAPSHOT_INVALID'; end if;
  v_counts:=p_snapshot->'counts';
  select count(*) into v_projects from jsonb_array_elements(p_snapshot->'projects');
  select count(*) into v_private from jsonb_array_elements(p_snapshot->'privateProjectMembers');
  select count(*) into v_tasks from jsonb_array_elements(p_snapshot->'tasks');
  select count(*) into v_checkpoints from jsonb_array_elements(p_snapshot->'checkpoints');
  select count(*) into v_operations from jsonb_array_elements(p_snapshot->'operations');
  select count(*) into v_events from jsonb_array_elements(p_snapshot->'events');
  if (v_counts->>'projects')::integer<>v_projects or (v_counts->>'privateProjectMembers')::integer<>v_private
     or (v_counts->>'tasks')::integer<>v_tasks or (v_counts->>'checkpoints')::integer<>v_checkpoints
     or (v_counts->>'operations')::integer<>v_operations or (v_counts->>'events')::integer<>v_events
     or (p_snapshot->>'contextSeq')::bigint<>v_events
  then raise exception 'BUSINESS_RESTORE_COUNT_MISMATCH'; end if;

  for v_project in select value from jsonb_array_elements(p_snapshot->'projects') loop
    v_user:=(v_project->>'createdByUserId')::uuid;
    if not exists(select 1 from private_business_control.organization_members where organization_id=v_org and user_id=v_user)
      then raise exception 'BUSINESS_RESTORE_MEMBER_PREREQUISITE_MISSING'; end if;
    insert into private_business_control.logical_projects(id,organization_id,project_key,display_name,collaboration_mode,project_profile,
      policy_revision,created_by_user_id,created_at,updated_at)
    values((v_project->>'projectId')::uuid,v_org,v_project->>'projectKey',v_project->>'displayName',v_project->>'collaborationMode',
      v_project->>'projectProfile',(v_project->>'policyRevision')::bigint,v_user,(v_project->>'createdAt')::timestamptz,(v_project->>'updatedAt')::timestamptz);
  end loop;

  for v_member in select value from jsonb_array_elements(p_snapshot->'privateProjectMembers') loop
    if not exists(select 1 from private_business_control.organization_members where organization_id=v_org and user_id=(v_member->>'userId')::uuid)
       or not exists(select 1 from private_business_control.organization_members where organization_id=v_org and user_id=(v_member->>'grantedByUserId')::uuid)
      then raise exception 'BUSINESS_RESTORE_MEMBER_PREREQUISITE_MISSING'; end if;
    insert into private_business_control.private_project_members(organization_id,project_id,user_id,granted_by_user_id,granted_at)
    values(v_org,(v_member->>'projectId')::uuid,(v_member->>'userId')::uuid,(v_member->>'grantedByUserId')::uuid,(v_member->>'grantedAt')::timestamptz);
  end loop;

  for v_task in select value from jsonb_array_elements(p_snapshot->'tasks') loop
    for v_user in select x from unnest(array[(v_task->>'createdByUserId')::uuid,(v_task->>'assignedToUserId')::uuid,(v_task->>'completedByUserId')::uuid]) x where x is not null loop
      if not exists(select 1 from private_business_control.organization_members where organization_id=v_org and user_id=v_user)
        then raise exception 'BUSINESS_RESTORE_MEMBER_PREREQUISITE_MISSING'; end if;
    end loop;
    insert into private_business_continuity.tasks(id,organization_id,project_id,objective,status,revision,created_by_user_id,
      assigned_to_user_id,tags,started_at,completed_at,completed_by_user_id)
    values((v_task->>'taskId')::uuid,v_org,(v_task->>'projectId')::uuid,v_task->>'objective',v_task->>'status',(v_task->>'revision')::bigint,
      (v_task->>'createdByUserId')::uuid,(v_task->>'assignedToUserId')::uuid,
      array(select jsonb_array_elements_text(coalesce(v_task->'tags','[]'::jsonb))),(v_task->>'startedAt')::timestamptz,
      (v_task->>'completedAt')::timestamptz,(v_task->>'completedByUserId')::uuid);
  end loop;

  for v_cp in select value from jsonb_array_elements(p_snapshot->'checkpoints') loop
    v_user:=(v_cp->>'sourceUserId')::uuid; v_node:=(v_cp->>'sourceRuntimeNodeId')::uuid;
    if not exists(select 1 from private_business_control.organization_members where organization_id=v_org and user_id=v_user)
      then raise exception 'BUSINESS_RESTORE_MEMBER_PREREQUISITE_MISSING'; end if;
    if v_node is not null and not exists(select 1 from private_business_control.runtime_nodes where organization_id=v_org and id=v_node)
      then raise exception 'BUSINESS_RESTORE_NODE_PREREQUISITE_MISSING'; end if;
    insert into private_business_continuity.checkpoints(id,organization_id,project_id,task_id,task_revision,summary,current_state,next_actions,
      verification,decisions,facts,artifacts,source_user_id,source_runtime_node_id,created_at)
    values((v_cp->>'checkpointId')::uuid,v_org,(v_cp->>'projectId')::uuid,(v_cp->>'taskId')::uuid,(v_cp->>'revision')::bigint,
      v_cp->>'summary',v_cp->>'currentState',array(select jsonb_array_elements_text(coalesce(v_cp->'nextActions','[]'::jsonb))),
      v_cp->>'verification',array(select jsonb_array_elements_text(coalesce(v_cp->'decisions','[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(v_cp->'facts','[]'::jsonb))),array(select jsonb_array_elements_text(coalesce(v_cp->'artifacts','[]'::jsonb))),
      v_user,v_node,(v_cp->>'createdAt')::timestamptz);
  end loop;

  for v_op in select value from jsonb_array_elements(p_snapshot->'operations') loop
    insert into private_business_continuity.operations(organization_id,operation_id,operation_kind,input_sha256,receipt,created_at)
    values(v_org,(v_op->>'operationId')::uuid,v_op->>'operationKind',v_op->>'inputSha256',v_op->'receipt',(v_op->>'createdAt')::timestamptz);
  end loop;

  for v_event in select value from jsonb_array_elements(p_snapshot->'events') order by (value->>'seq')::bigint loop
    v_user:=(v_event->>'actorUserId')::uuid;
    if not exists(select 1 from private_business_control.organization_members where organization_id=v_org and user_id=v_user)
      then raise exception 'BUSINESS_RESTORE_MEMBER_PREREQUISITE_MISSING'; end if;
    insert into private_business_continuity.events(organization_id,seq,event_kind,project_id,task_id,checkpoint_id,actor_user_id,
      payload_sha256,previous_sha256,event_sha256,created_at)
    values(v_org,(v_event->>'seq')::bigint,v_event->>'eventKind',(v_event->>'projectId')::uuid,(v_event->>'taskId')::uuid,
      (v_event->>'checkpointId')::uuid,v_user,v_event->>'payloadSha256',v_event->>'previousSha256',v_event->>'eventSha256',(v_event->>'createdAt')::timestamptz);
  end loop;

  v_seq:=(p_snapshot->>'contextSeq')::bigint; v_head:=p_snapshot->>'headSha256';
  insert into private_business_continuity.continuity_state(organization_id,context_seq,head_sha256,updated_at) values(v_org,v_seq,v_head,now());
  if not private_business_continuity._event_chain_verified(v_org) then raise exception 'BUSINESS_RESTORE_TARGET_INTEGRITY_FAILED'; end if;
  update private_business_control.control_state set policy_revision=policy_revision+v_projects,updated_at=now() where organization_id=v_org;
  update private_business_control.organizations set policy_revision=policy_revision+v_projects,updated_at=now() where id=v_org;
  return jsonb_build_object('restored',true,'organizationSlug',v_slug,'contextSeq',v_seq,'integrityVerified',true,
    'counts',jsonb_build_object('projects',v_projects,'privateProjectMembers',v_private,'tasks',v_tasks,'checkpoints',v_checkpoints,'operations',v_operations,'events',v_events));
end; $$;
revoke all on function private_business_continuity._restore_empty(jsonb,uuid) from public,anon,authenticated;

commit;
