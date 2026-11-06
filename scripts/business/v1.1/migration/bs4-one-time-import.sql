begin;

create or replace function public.bc_import_snapshot(p_snapshot jsonb,p_migration_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_payload jsonb; v_canonical text; v_digest text; v_org uuid; v_slug text;
  v_project jsonb; v_task jsonb; v_cp jsonb; v_event jsonb;
  v_project_id uuid; v_task_id uuid; v_checkpoint_id uuid; v_operation_id uuid;
  v_projects integer:=0; v_tasks integer:=0; v_checkpoints integer:=0; v_events integer:=0;
  v_cp_count bigint; v_cp_max bigint; v_seq bigint:=0; v_prev text:=repeat('0',64); v_hash text;
  v_source_seq bigint:=0; v_input jsonb; v_input_sha text; v_receipt jsonb; v_event_kind text; v_operation_kind text;
  v_objective text; v_status text; v_revision bigint; v_expected bigint; v_completed_at timestamptz;
begin
  if p_snapshot is null or p_migration_actor_user_id is null
     or p_snapshot->>'sourceProduct'<>'ChatAgent Business' or p_snapshot->>'sourceVersion'<>'1.0.0'
     or (p_snapshot->>'schemaVersion')::integer<>1 or (p_snapshot->>'contractVersion')::integer<>1
  then raise exception 'BUSINESS_MIGRATION_SNAPSHOT_INVALID'; end if;
  v_payload:=p_snapshot->'payload'; v_canonical:=p_snapshot->>'canonicalPayload'; v_digest:=p_snapshot->>'logicalDigest';
  if v_payload is null or v_canonical is null or length(v_canonical)>33554432
     or v_digest !~ '^sha256:[a-f0-9]{64}$'
     or v_canonical::jsonb is distinct from v_payload
     or v_digest<>'sha256:'||encode(extensions.digest(convert_to(v_canonical,'UTF8'),'sha256'),'hex')
  then raise exception 'BUSINESS_MIGRATION_SNAPSHOT_DIGEST_INVALID'; end if;
  v_slug:=v_payload->>'organizationId';
  if v_slug is null or v_slug !~ '^[a-z0-9][a-z0-9._-]{0,63}$' then raise exception 'BUSINESS_MIGRATION_ORGANIZATION_INVALID'; end if;
  select id into v_org from private_business_control.organizations where slug=v_slug;
  if not found then raise exception 'BUSINESS_MIGRATION_ORGANIZATION_MISMATCH'; end if;
  if not exists(select 1 from private_business_control.organization_members
      where organization_id=v_org and user_id=p_migration_actor_user_id and role='ADMIN' and member_state='ACTIVE' and revoked_at is null)
  then raise exception 'BUSINESS_MIGRATION_ADMIN_REQUIRED'; end if;
  if exists(select 1 from private_business_control.logical_projects where organization_id=v_org)
     or exists(select 1 from private_business_continuity.continuity_state where organization_id=v_org)
     or exists(select 1 from private_business_continuity.tasks where organization_id=v_org)
     or exists(select 1 from private_business_continuity.checkpoints where organization_id=v_org)
     or exists(select 1 from private_business_continuity.operations where organization_id=v_org)
     or exists(select 1 from private_business_continuity.events where organization_id=v_org)
  then raise exception 'BUSINESS_MIGRATION_TARGET_NOT_EMPTY'; end if;
  if jsonb_typeof(v_payload->'projects')<>'array' or jsonb_typeof(v_payload->'sourceEvents')<>'array'
     or jsonb_typeof(v_payload->'counts')<>'object' then raise exception 'BUSINESS_MIGRATION_SNAPSHOT_INVALID'; end if;

  select count(*) into v_projects from jsonb_array_elements(v_payload->'projects');
  select coalesce(sum(jsonb_array_length(p.value->'tasks')),0),coalesce(sum(jsonb_array_length(p.value->'checkpoints')),0)
    into v_tasks,v_checkpoints from jsonb_array_elements(v_payload->'projects') p(value);
  select count(*) into v_events from jsonb_array_elements(v_payload->'sourceEvents');
  if (v_payload->'counts'->>'projects')::integer<>v_projects or (v_payload->'counts'->>'tasks')::integer<>v_tasks
     or (v_payload->'counts'->>'checkpoints')::integer<>v_checkpoints or (v_payload->'counts'->>'operations')::integer<>v_events
     or (v_payload->'counts'->>'events')::integer<>v_events
  then raise exception 'BUSINESS_MIGRATION_COUNT_MISMATCH'; end if;

  for v_project in select value from jsonb_array_elements(v_payload->'projects') loop
    if v_project->>'projectKey' !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
       or length(btrim(v_project->>'displayName')) not between 1 and 128
       or v_project->>'projectProfile' not in ('READ_ONLY','SAFE','STANDARD')
       or v_project->>'collaborationMode'<>'TEAM' or coalesce((v_project->>'sourceEnabled')::boolean,false)<>true
    then raise exception 'BUSINESS_MIGRATION_PROJECT_INVALID'; end if;
    insert into private_business_control.logical_projects(
      organization_id,project_key,display_name,collaboration_mode,project_profile,policy_revision,created_by_user_id
    ) values(v_org,v_project->>'projectKey',btrim(v_project->>'displayName'),'TEAM',v_project->>'projectProfile',1,p_migration_actor_user_id);
  end loop;

  for v_project in select value from jsonb_array_elements(v_payload->'projects') loop
    select id into strict v_project_id from private_business_control.logical_projects
      where organization_id=v_org and project_key=v_project->>'projectKey';
    for v_task in select value from jsonb_array_elements(v_project->'tasks') loop
      v_task_id:=(v_task->>'taskId')::uuid; v_objective:=btrim(v_task->>'objective'); v_status:=v_task->>'status';
      v_revision:=(v_task->>'revision')::bigint;
      if length(v_objective) not between 1 and 4096 or v_status not in ('ACTIVE','COMPLETED') or v_revision<0
         or v_task->>'projectKey'<>v_project->>'projectKey' or (v_task->>'startedAt')::numeric<0
         or (v_status='ACTIVE' and v_task->'completedAt'<>'null'::jsonb)
         or (v_status='COMPLETED' and (v_task->'completedAt' is null or v_task->'completedAt'='null'::jsonb))
      then raise exception 'BUSINESS_MIGRATION_TASK_INVALID'; end if;
      v_completed_at:=case when v_status='COMPLETED' then to_timestamp((v_task->>'completedAt')::double precision/1000.0) else null end;
      insert into private_business_continuity.tasks(id,organization_id,project_id,objective,status,revision,created_by_user_id,
        assigned_to_user_id,tags,started_at,completed_at,completed_by_user_id)
      values(v_task_id,v_org,v_project_id,v_objective,v_status,v_revision,p_migration_actor_user_id,null,'{}'::text[],
        to_timestamp((v_task->>'startedAt')::double precision/1000.0),v_completed_at,
        case when v_status='COMPLETED' then p_migration_actor_user_id else null end);
    end loop;
    for v_cp in select value from jsonb_array_elements(v_project->'checkpoints') loop
      v_checkpoint_id:=(v_cp->>'checkpointId')::uuid; v_task_id:=(v_cp->>'taskId')::uuid;
      if (v_cp->>'revision')::bigint<1 or length(btrim(v_cp->>'summary')) not between 1 and 4096
         or length(btrim(v_cp->>'currentState')) not between 1 and 8192
         or not exists(select 1 from private_business_continuity.tasks where organization_id=v_org and project_id=v_project_id and id=v_task_id)
      then raise exception 'BUSINESS_MIGRATION_CHECKPOINT_INVALID'; end if;
      insert into private_business_continuity.checkpoints(id,organization_id,project_id,task_id,task_revision,summary,current_state,
        next_actions,verification,decisions,facts,artifacts,source_user_id,source_runtime_node_id,created_at)
      values(v_checkpoint_id,v_org,v_project_id,v_task_id,(v_cp->>'revision')::bigint,btrim(v_cp->>'summary'),btrim(v_cp->>'currentState'),
        array(select jsonb_array_elements_text(coalesce(v_cp->'nextActions','[]'::jsonb))),nullif(btrim(v_cp->>'verification'),''),
        array(select jsonb_array_elements_text(coalesce(v_cp->'decisions','[]'::jsonb))),
        array(select jsonb_array_elements_text(coalesce(v_cp->'facts','[]'::jsonb))),
        array(select jsonb_array_elements_text(coalesce(v_cp->'artifacts','[]'::jsonb))),p_migration_actor_user_id,null,
        to_timestamp((v_cp->>'createdAt')::double precision/1000.0));
    end loop;
  end loop;

  for v_task in select t.value from jsonb_array_elements(v_payload->'projects') p(value), lateral jsonb_array_elements(p.value->'tasks') t(value) loop
    v_task_id:=(v_task->>'taskId')::uuid; v_revision:=(v_task->>'revision')::bigint; v_status:=v_task->>'status';
    select count(*),coalesce(max(task_revision),0) into v_cp_count,v_cp_max
      from private_business_continuity.checkpoints where organization_id=v_org and task_id=v_task_id;
    if v_cp_count<>v_cp_max or (v_status='ACTIVE' and v_revision<>v_cp_max) or (v_status='COMPLETED' and v_revision<>v_cp_max+1)
      then raise exception 'BUSINESS_MIGRATION_REVISION_MISMATCH'; end if;
  end loop;

  for v_event in select value from jsonb_array_elements(v_payload->'sourceEvents') order by (value->>'sourceSeq')::bigint loop
    if (v_event->>'sourceSeq')::bigint<=v_source_seq then raise exception 'BUSINESS_MIGRATION_EVENT_ORDER_INVALID'; end if;
    v_source_seq:=(v_event->>'sourceSeq')::bigint; v_seq:=v_seq+1;
    select id into v_project_id from private_business_control.logical_projects where organization_id=v_org and project_key=v_event->>'projectKey';
    if v_project_id is null then raise exception 'BUSINESS_MIGRATION_PROJECT_INVALID'; end if;
    v_task_id:=(v_event->>'taskId')::uuid; v_operation_id:=(v_event->>'operationId')::uuid;
    if v_event->>'kind'='TASK' then
      select objective into strict v_objective from private_business_continuity.tasks where organization_id=v_org and project_id=v_project_id and id=v_task_id;
      v_input:=jsonb_build_object('projectId',v_project_id,'objective',v_objective,'assignedToUserId',null,'tags','{}'::text[]);
      v_event_kind:='TASK_STARTED'; v_operation_kind:='task_start';
      v_receipt:=jsonb_build_object('taskId',v_task_id,'projectId',v_project_id,'status','ACTIVE','revision',0,'contextSeq',v_seq);
      v_checkpoint_id:=null;
    elsif v_event->>'kind'='CHECKPOINT' then
      v_checkpoint_id:=(v_event->>'checkpointId')::uuid; v_expected:=(v_event->>'expectedTaskRevision')::bigint;
      select jsonb_build_object('projectId',c.project_id,'taskId',c.task_id,'expectedTaskRevision',v_expected,
        'summary',c.summary,'currentState',c.current_state,'nextActions',c.next_actions,'verification',c.verification,
        'decisions',c.decisions,'facts',c.facts,'artifacts',c.artifacts,'sourceRuntimeNodeId',null)
        into v_input from private_business_continuity.checkpoints c where c.organization_id=v_org and c.id=v_checkpoint_id and c.task_id=v_task_id;
      if v_input is null or (v_event->>'resultingRevision')::bigint<>v_expected+1 then raise exception 'BUSINESS_MIGRATION_EVENT_INVALID'; end if;
      v_event_kind:='CHECKPOINT_APPENDED'; v_operation_kind:='checkpoint_append';
      v_receipt:=jsonb_build_object('taskId',v_task_id,'checkpointId',v_checkpoint_id,'revision',v_expected+1,'contextSeq',v_seq);
    elsif v_event->>'kind'='COMPLETE' then
      v_expected:=(v_event->>'expectedTaskRevision')::bigint; v_checkpoint_id:=null;
      if (v_event->>'resultingRevision')::bigint<>v_expected+1 then raise exception 'BUSINESS_MIGRATION_EVENT_INVALID'; end if;
      v_input:=jsonb_build_object('projectId',v_project_id,'taskId',v_task_id,'expectedTaskRevision',v_expected);
      v_event_kind:='TASK_COMPLETED'; v_operation_kind:='task_complete';
      v_receipt:=jsonb_build_object('taskId',v_task_id,'projectId',v_project_id,'status','COMPLETED','revision',v_expected+1,'contextSeq',v_seq);
    else raise exception 'BUSINESS_MIGRATION_EVENT_INVALID'; end if;
    perform private_business_continuity._assert_clean_input(v_input); v_input_sha:=private_business_continuity._input_sha256(v_input);
    if exists(select 1 from private_business_continuity.operations where organization_id=v_org and operation_id=v_operation_id)
      then raise exception 'BUSINESS_MIGRATION_OPERATION_DUPLICATE'; end if;
    insert into private_business_continuity.operations(organization_id,operation_id,operation_kind,input_sha256,receipt,created_at)
      values(v_org,v_operation_id,v_operation_kind,v_input_sha,v_receipt,to_timestamp((v_event->>'at')::double precision/1000.0));
    v_hash:=private_business_continuity._input_sha256(jsonb_build_object('seq',v_seq,'eventKind',v_event_kind,
      'projectId',v_project_id,'taskId',v_task_id,'checkpointId',v_checkpoint_id,'actorUserId',p_migration_actor_user_id,
      'payloadSha256',v_input_sha,'previousSha256',v_prev));
    insert into private_business_continuity.events(organization_id,seq,event_kind,project_id,task_id,checkpoint_id,
      actor_user_id,payload_sha256,previous_sha256,event_sha256,created_at)
    values(v_org,v_seq,v_event_kind,v_project_id,v_task_id,v_checkpoint_id,p_migration_actor_user_id,v_input_sha,v_prev,v_hash,
      to_timestamp((v_event->>'at')::double precision/1000.0));
    v_prev:=v_hash;
  end loop;

  if v_seq<>v_events then raise exception 'BUSINESS_MIGRATION_EVENT_COUNT_MISMATCH'; end if;
  insert into private_business_continuity.continuity_state(organization_id,context_seq,head_sha256,updated_at)
    values(v_org,v_seq,v_prev,now());
  update private_business_control.control_state set policy_revision=policy_revision+v_projects,updated_at=now() where organization_id=v_org;
  update private_business_control.organizations set policy_revision=policy_revision+v_projects,updated_at=now() where id=v_org;
  if not private_business_continuity._event_chain_verified(v_org) then raise exception 'BUSINESS_MIGRATION_TARGET_INTEGRITY_FAILED'; end if;
  return jsonb_build_object('imported',true,'organizationId',v_slug,'sourceLogicalDigest',v_digest,
    'counts',jsonb_build_object('projects',v_projects,'tasks',v_tasks,'checkpoints',v_checkpoints,'operations',v_events,'events',v_events),
    'contextSeq',v_seq,'integrityVerified',true);
end; $$;

revoke all on function public.bc_import_snapshot(jsonb,uuid) from public,anon,authenticated;
comment on function public.bc_import_snapshot(jsonb,uuid) is 'B-S4 migration-only one-time import surface. Never grant to authenticated runtime; drop after accepted import.';

commit;
