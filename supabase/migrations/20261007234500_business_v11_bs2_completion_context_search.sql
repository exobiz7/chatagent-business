begin;

alter table private_business_continuity.tasks
  add column if not exists search_text text not null default '';
alter table private_business_continuity.checkpoints
  add column if not exists search_text text not null default '';

update private_business_continuity.tasks
set search_text=btrim(concat_ws(' ',objective,array_to_string(tags,' ')))
where search_text='';

update private_business_continuity.checkpoints
set search_text=btrim(concat_ws(' ',summary,current_state,array_to_string(next_actions,' '),verification,
  array_to_string(decisions,' '),array_to_string(facts,' '),array_to_string(artifacts,' ')))
where search_text='';

create index if not exists continuity_tasks_search_fts_idx
  on private_business_continuity.tasks using gin(to_tsvector('simple'::regconfig,search_text));
create index if not exists continuity_checkpoints_search_fts_idx
  on private_business_continuity.checkpoints using gin(to_tsvector('simple'::regconfig,search_text));

create or replace function public.bc_task_start(
 p_project_id uuid,p_objective text,p_operation_id uuid,p_assigned_to_user_id uuid default null,p_tags text[] default '{}'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_access record; v_state private_business_continuity.continuity_state%rowtype; v_op private_business_continuity.operations%rowtype;
 v_input jsonb; v_sha text; v_task uuid; v_receipt jsonb; v_event record; v_objective text:=btrim(p_objective); v_tags text[]:=coalesce(p_tags,'{}');
 v_search_text text;
begin
 select * into v_access from private_business_control._require_project_access(p_project_id);
 if p_operation_id is null or v_objective is null or length(v_objective) not between 1 and 4096 or cardinality(v_tags)>32
    or exists(select 1 from unnest(v_tags) x where length(btrim(x)) not between 1 and 64)
 then raise exception 'BUSINESS_CONTINUITY_INPUT_INVALID'; end if;
 if p_assigned_to_user_id is not null then
   if not exists(select 1 from private_business_control.organization_members m where m.organization_id=v_access.organization_id
      and m.user_id=p_assigned_to_user_id and m.member_state='ACTIVE' and m.revoked_at is null) then raise exception 'BUSINESS_ASSIGNEE_INVALID'; end if;
   if v_access.collaboration_mode='PRIVATE' and not exists(select 1 from private_business_control.private_project_members ppm
      where ppm.organization_id=v_access.organization_id and ppm.project_id=p_project_id and ppm.user_id=p_assigned_to_user_id)
      then raise exception 'BUSINESS_PRIVATE_ASSIGNEE_DENIED'; end if;
 end if;
 v_input:=jsonb_build_object('projectId',p_project_id,'objective',v_objective,'assignedToUserId',p_assigned_to_user_id,'tags',v_tags);
 perform private_business_continuity._assert_clean_input(v_input); v_sha:=private_business_continuity._input_sha256(v_input);
 v_search_text:=btrim(concat_ws(' ',v_objective,array_to_string(v_tags,' ')));
 insert into private_business_continuity.continuity_state(organization_id) values(v_access.organization_id) on conflict do nothing;
 select * into v_state from private_business_continuity.continuity_state where organization_id=v_access.organization_id for update;
 select * into v_op from private_business_continuity.operations where organization_id=v_access.organization_id and operation_id=p_operation_id;
 if found then if v_op.operation_kind<>'task_start' or v_op.input_sha256<>v_sha then raise exception 'BUSINESS_IDEMPOTENCY_CONFLICT'; end if; return v_op.receipt; end if;
 insert into private_business_continuity.tasks(organization_id,project_id,objective,created_by_user_id,assigned_to_user_id,tags,search_text)
 values(v_access.organization_id,p_project_id,v_objective,v_access.member_user_id,p_assigned_to_user_id,v_tags,v_search_text) returning id into v_task;
 select * into v_event from private_business_continuity._append_event(v_access.organization_id,p_project_id,v_task,null,v_access.member_user_id,'TASK_STARTED',v_sha);
 v_receipt:=jsonb_build_object('taskId',v_task,'projectId',p_project_id,'status','ACTIVE','revision',0,'contextSeq',v_event.context_seq);
 insert into private_business_continuity.operations values(v_access.organization_id,p_operation_id,'task_start',v_sha,v_receipt,now());
 return v_receipt;
end; $$;

create or replace function public.bc_checkpoint_append(
 p_project_id uuid,p_task_id uuid,p_expected_task_revision bigint,p_summary text,p_current_state text,p_operation_id uuid,
 p_next_actions text[] default '{}',p_verification text default null,p_decisions text[] default '{}',p_facts text[] default '{}',
 p_artifacts text[] default '{}',p_source_runtime_node_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_access record; v_state private_business_continuity.continuity_state%rowtype; v_op private_business_continuity.operations%rowtype;
 v_task private_business_continuity.tasks%rowtype; v_input jsonb; v_sha text; v_cp uuid; v_new_rev bigint; v_receipt jsonb; v_event record;
 v_summary text:=btrim(p_summary); v_current text:=btrim(p_current_state); v_verify text:=nullif(btrim(p_verification),''); v_search_text text;
begin
 select * into v_access from private_business_control._require_project_access(p_project_id);
 if p_task_id is null or p_operation_id is null or p_expected_task_revision<0 or length(v_summary) not between 1 and 4096 or length(v_current) not between 1 and 8192
    or coalesce(length(v_verify),0)>4096 or cardinality(coalesce(p_next_actions,'{}'))>32 or cardinality(coalesce(p_decisions,'{}'))>32
    or cardinality(coalesce(p_facts,'{}'))>32 or cardinality(coalesce(p_artifacts,'{}'))>32
 then raise exception 'BUSINESS_CONTINUITY_INPUT_INVALID'; end if;
 if p_source_runtime_node_id is not null and not exists(
   select 1 from private_business_control.runtime_nodes n where n.organization_id=v_access.organization_id and n.id=p_source_runtime_node_id
    and n.lifecycle='APPROVED' and (n.node_type='SHARED_NODE' or n.owner_user_id=v_access.member_user_id)
 ) then raise exception 'BUSINESS_RUNTIME_NODE_DENIED'; end if;
 v_input:=jsonb_build_object('projectId',p_project_id,'taskId',p_task_id,'expectedTaskRevision',p_expected_task_revision,
   'summary',v_summary,'currentState',v_current,'nextActions',coalesce(p_next_actions,'{}'),'verification',v_verify,
   'decisions',coalesce(p_decisions,'{}'),'facts',coalesce(p_facts,'{}'),'artifacts',coalesce(p_artifacts,'{}'),'sourceRuntimeNodeId',p_source_runtime_node_id);
 perform private_business_continuity._assert_clean_input(v_input); v_sha:=private_business_continuity._input_sha256(v_input);
 v_search_text:=btrim(concat_ws(' ',v_summary,v_current,array_to_string(coalesce(p_next_actions,'{}'),' '),v_verify,
   array_to_string(coalesce(p_decisions,'{}'),' '),array_to_string(coalesce(p_facts,'{}'),' '),array_to_string(coalesce(p_artifacts,'{}'),' ')));
 insert into private_business_continuity.continuity_state(organization_id) values(v_access.organization_id) on conflict do nothing;
 select * into v_state from private_business_continuity.continuity_state where organization_id=v_access.organization_id for update;
 select * into v_op from private_business_continuity.operations where organization_id=v_access.organization_id and operation_id=p_operation_id;
 if found then if v_op.operation_kind<>'checkpoint_append' or v_op.input_sha256<>v_sha then raise exception 'BUSINESS_IDEMPOTENCY_CONFLICT'; end if; return v_op.receipt; end if;
 select * into v_task from private_business_continuity.tasks where organization_id=v_access.organization_id and id=p_task_id and project_id=p_project_id for update;
 if not found then raise exception 'BUSINESS_TASK_NOT_FOUND'; end if;
 if v_task.status<>'ACTIVE' then raise exception 'BUSINESS_TASK_COMPLETED'; end if;
 if v_task.revision<>p_expected_task_revision then raise exception 'BUSINESS_REVISION_CONFLICT'; end if;
 v_new_rev:=v_task.revision+1;
 insert into private_business_continuity.checkpoints(organization_id,project_id,task_id,task_revision,summary,current_state,next_actions,
   verification,decisions,facts,artifacts,source_user_id,source_runtime_node_id,search_text)
 values(v_access.organization_id,p_project_id,p_task_id,v_new_rev,v_summary,v_current,coalesce(p_next_actions,'{}'),v_verify,
   coalesce(p_decisions,'{}'),coalesce(p_facts,'{}'),coalesce(p_artifacts,'{}'),v_access.member_user_id,p_source_runtime_node_id,v_search_text) returning id into v_cp;
 update private_business_continuity.tasks set revision=v_new_rev where organization_id=v_access.organization_id and id=p_task_id;
 select * into v_event from private_business_continuity._append_event(v_access.organization_id,p_project_id,p_task_id,v_cp,v_access.member_user_id,'CHECKPOINT_APPENDED',v_sha);
 v_receipt:=jsonb_build_object('taskId',p_task_id,'checkpointId',v_cp,'revision',v_new_rev,'contextSeq',v_event.context_seq);
 insert into private_business_continuity.operations values(v_access.organization_id,p_operation_id,'checkpoint_append',v_sha,v_receipt,now());
 return v_receipt;
end; $$;

create or replace function public.bc_task_complete(
 p_project_id uuid,p_task_id uuid,p_expected_task_revision bigint,p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_access record; v_state private_business_continuity.continuity_state%rowtype; v_op private_business_continuity.operations%rowtype;
 v_task private_business_continuity.tasks%rowtype; v_input jsonb; v_sha text; v_new_rev bigint; v_receipt jsonb; v_event record;
begin
 select * into v_access from private_business_control._require_project_access(p_project_id);
 if p_task_id is null or p_operation_id is null or p_expected_task_revision<0 then raise exception 'BUSINESS_CONTINUITY_INPUT_INVALID'; end if;
 v_input:=jsonb_build_object('projectId',p_project_id,'taskId',p_task_id,'expectedTaskRevision',p_expected_task_revision);
 v_sha:=private_business_continuity._input_sha256(v_input);
 insert into private_business_continuity.continuity_state(organization_id) values(v_access.organization_id) on conflict do nothing;
 select * into v_state from private_business_continuity.continuity_state where organization_id=v_access.organization_id for update;
 select * into v_op from private_business_continuity.operations where organization_id=v_access.organization_id and operation_id=p_operation_id;
 if found then if v_op.operation_kind<>'task_complete' or v_op.input_sha256<>v_sha then raise exception 'BUSINESS_IDEMPOTENCY_CONFLICT'; end if; return v_op.receipt; end if;
 select * into v_task from private_business_continuity.tasks where organization_id=v_access.organization_id and project_id=p_project_id and id=p_task_id for update;
 if not found then raise exception 'BUSINESS_TASK_NOT_FOUND'; end if;
 if v_task.status<>'ACTIVE' then raise exception 'BUSINESS_TASK_COMPLETED'; end if;
 if v_task.revision<>p_expected_task_revision then raise exception 'BUSINESS_REVISION_CONFLICT'; end if;
 v_new_rev:=v_task.revision+1;
 update private_business_continuity.tasks set status='COMPLETED',revision=v_new_rev,completed_at=now(),completed_by_user_id=v_access.member_user_id
 where organization_id=v_access.organization_id and id=p_task_id;
 select * into v_event from private_business_continuity._append_event(v_access.organization_id,p_project_id,p_task_id,null,v_access.member_user_id,'TASK_COMPLETED',v_sha);
 v_receipt:=jsonb_build_object('taskId',p_task_id,'projectId',p_project_id,'status','COMPLETED','revision',v_new_rev,'contextSeq',v_event.context_seq);
 insert into private_business_continuity.operations values(v_access.organization_id,p_operation_id,'task_complete',v_sha,v_receipt,now());
 return v_receipt;
end; $$;

create or replace function public.bc_project_context(p_project_id uuid,p_limit integer default 10)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_access record; v_seq bigint; v_tasks jsonb;
begin
 select * into v_access from private_business_control._require_project_access(p_project_id);
 if p_limit is null or p_limit<1 or p_limit>20 then raise exception 'BUSINESS_CONTINUITY_INPUT_INVALID'; end if;
 select coalesce(context_seq,0) into v_seq from private_business_continuity.continuity_state where organization_id=v_access.organization_id;
 with selected as (
   select t.* from private_business_continuity.tasks t
   where t.organization_id=v_access.organization_id and t.project_id=p_project_id
   order by (t.status='ACTIVE') desc,coalesce(t.completed_at,t.started_at) desc,t.started_at desc
   limit p_limit
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'taskId',s.id,'objective',s.objective,'status',s.status,'revision',s.revision,'assignedToUserId',s.assigned_to_user_id,
   'tags',s.tags,'startedAt',s.started_at,'completedAt',s.completed_at,
   'latestCheckpoint',(select jsonb_build_object('checkpointId',c.id,'revision',c.task_revision,'summary',c.summary,'currentState',c.current_state,
     'nextActions',c.next_actions,'verification',c.verification,'decisions',c.decisions,'facts',c.facts,'artifacts',c.artifacts,'createdAt',c.created_at)
     from private_business_continuity.checkpoints c where c.organization_id=v_access.organization_id and c.task_id=s.id order by c.task_revision desc limit 1)
 ) order by (s.status='ACTIVE') desc,coalesce(s.completed_at,s.started_at) desc,s.started_at desc),'[]'::jsonb) into v_tasks from selected s;
 return jsonb_build_object('projectId',p_project_id,'collaborationMode',v_access.collaboration_mode,'projectProfile',v_access.project_profile,
   'projectPolicyRevision',v_access.policy_revision,'contextSeq',coalesce(v_seq,0),'tasks',v_tasks);
end; $$;

create or replace function public.bc_history_search(p_project_id uuid,p_query text,p_limit integer default 10)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_access record; v_seq bigint; v_query text:=btrim(p_query); v_tsquery tsquery; v_matches jsonb;
begin
 select * into v_access from private_business_control._require_project_access(p_project_id);
 if v_query is null or length(v_query) not between 1 and 128 or p_limit is null or p_limit<1 or p_limit>20
 then raise exception 'BUSINESS_CONTINUITY_INPUT_INVALID'; end if;
 v_tsquery:=websearch_to_tsquery('simple'::regconfig,v_query);
 if numnode(v_tsquery)=0 then raise exception 'BUSINESS_CONTINUITY_QUERY_EMPTY'; end if;
 select coalesce(context_seq,0) into v_seq from private_business_continuity.continuity_state where organization_id=v_access.organization_id;
 with candidates as (
   select 'TASK'::text as match_kind,t.id as task_id,null::uuid as checkpoint_id,t.revision,t.objective,null::text as summary,
     null::text as current_state,t.started_at as created_at,ts_rank_cd(to_tsvector('simple'::regconfig,t.search_text),v_tsquery) as rank
   from private_business_continuity.tasks t
   where t.organization_id=v_access.organization_id and t.project_id=p_project_id
     and to_tsvector('simple'::regconfig,t.search_text) @@ v_tsquery
   union all
   select 'CHECKPOINT',c.task_id,c.id,c.task_revision,t.objective,c.summary,c.current_state,c.created_at,
     ts_rank_cd(to_tsvector('simple'::regconfig,c.search_text),v_tsquery) as rank
   from private_business_continuity.checkpoints c
   join private_business_continuity.tasks t on t.organization_id=c.organization_id and t.id=c.task_id
   where c.organization_id=v_access.organization_id and c.project_id=p_project_id
     and to_tsvector('simple'::regconfig,c.search_text) @@ v_tsquery
 ), ranked as (
   select * from candidates order by rank desc,created_at desc,task_id,checkpoint_id nulls first limit p_limit
 )
 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('matchKind',match_kind,'taskId',task_id,'checkpointId',checkpoint_id,
   'revision',revision,'objective',objective,'summary',summary,'currentState',current_state,'rank',rank,'createdAt',created_at))
   order by rank desc,created_at desc),'[]'::jsonb) into v_matches from ranked;
 return jsonb_build_object('projectId',p_project_id,'query',v_query,'contextSeq',coalesce(v_seq,0),'matches',v_matches);
end; $$;

revoke all on function public.bc_task_complete(uuid,uuid,bigint,uuid) from public,anon;
revoke all on function public.bc_project_context(uuid,integer) from public,anon;
revoke all on function public.bc_history_search(uuid,text,integer) from public,anon;
grant execute on function public.bc_task_complete(uuid,uuid,bigint,uuid) to authenticated;
grant execute on function public.bc_project_context(uuid,integer) to authenticated;
grant execute on function public.bc_history_search(uuid,text,integer) to authenticated;

commit;
