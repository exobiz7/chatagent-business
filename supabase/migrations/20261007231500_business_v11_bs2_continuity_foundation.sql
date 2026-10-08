begin;

create schema if not exists private_business_continuity;

create table if not exists private_business_continuity.schema_meta(
  singleton boolean primary key default true check(singleton),
  schema_version integer not null default 1 check(schema_version=1),
  contract_version integer not null default 1 check(contract_version=1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into private_business_continuity.schema_meta(singleton) values(true) on conflict(singleton) do nothing;

create table if not exists private_business_continuity.continuity_state(
  organization_id uuid primary key references private_business_control.organizations(id) on delete cascade,
  context_seq bigint not null default 0 check(context_seq>=0),
  head_sha256 text not null default repeat('0',64) check(head_sha256 ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz not null default now()
);

create table if not exists private_business_continuity.tasks(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  objective text not null check(length(btrim(objective)) between 1 and 4096),
  status text not null default 'ACTIVE' check(status in ('ACTIVE','COMPLETED')),
  revision bigint not null default 0 check(revision>=0),
  created_by_user_id uuid not null,
  assigned_to_user_id uuid,
  tags text[] not null default '{}',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by_user_id uuid,
  unique(organization_id,id),
  foreign key(organization_id,project_id) references private_business_control.logical_projects(organization_id,id) on delete cascade,
  foreign key(organization_id,created_by_user_id) references private_business_control.organization_members(organization_id,user_id),
  foreign key(organization_id,assigned_to_user_id) references private_business_control.organization_members(organization_id,user_id),
  foreign key(organization_id,completed_by_user_id) references private_business_control.organization_members(organization_id,user_id),
  check((status='ACTIVE' and completed_at is null and completed_by_user_id is null) or
        (status='COMPLETED' and completed_at is not null and completed_by_user_id is not null))
);

create table if not exists private_business_continuity.checkpoints(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  task_id uuid not null,
  task_revision bigint not null check(task_revision>=1),
  summary text not null check(length(btrim(summary)) between 1 and 4096),
  current_state text not null check(length(btrim(current_state)) between 1 and 8192),
  next_actions text[] not null default '{}',
  verification text,
  decisions text[] not null default '{}',
  facts text[] not null default '{}',
  artifacts text[] not null default '{}',
  source_user_id uuid not null,
  source_runtime_node_id uuid,
  created_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,task_id,task_revision),
  foreign key(organization_id,project_id) references private_business_control.logical_projects(organization_id,id) on delete cascade,
  foreign key(organization_id,task_id) references private_business_continuity.tasks(organization_id,id) on delete cascade,
  foreign key(organization_id,source_user_id) references private_business_control.organization_members(organization_id,user_id),
  foreign key(organization_id,source_runtime_node_id) references private_business_control.runtime_nodes(organization_id,id)
);

create table if not exists private_business_continuity.operations(
  organization_id uuid not null references private_business_control.organizations(id) on delete cascade,
  operation_id uuid not null,
  operation_kind text not null check(operation_kind ~ '^[a-z][a-z0-9_]{2,80}$'),
  input_sha256 text not null check(input_sha256 ~ '^[a-f0-9]{64}$'),
  receipt jsonb not null,
  created_at timestamptz not null default now(),
  primary key(organization_id,operation_id)
);

create table if not exists private_business_continuity.events(
  organization_id uuid not null references private_business_control.organizations(id) on delete cascade,
  seq bigint not null check(seq>=1),
  event_kind text not null check(event_kind ~ '^[A-Z][A-Z0-9_]{2,80}$'),
  project_id uuid not null,
  task_id uuid,
  checkpoint_id uuid,
  actor_user_id uuid not null,
  payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'),
  previous_sha256 text not null check(previous_sha256 ~ '^[a-f0-9]{64}$'),
  event_sha256 text not null check(event_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key(organization_id,seq),
  foreign key(organization_id,project_id) references private_business_control.logical_projects(organization_id,id) on delete cascade,
  foreign key(organization_id,task_id) references private_business_continuity.tasks(organization_id,id) on delete cascade,
  foreign key(organization_id,checkpoint_id) references private_business_continuity.checkpoints(organization_id,id) on delete cascade,
  foreign key(organization_id,actor_user_id) references private_business_control.organization_members(organization_id,user_id)
);

create index if not exists continuity_tasks_project_status_idx on private_business_continuity.tasks(organization_id,project_id,status,started_at desc);
create index if not exists continuity_checkpoints_task_idx on private_business_continuity.checkpoints(organization_id,task_id,task_revision desc);
create index if not exists continuity_events_project_seq_idx on private_business_continuity.events(organization_id,project_id,seq desc);

create or replace function private_business_continuity._input_sha256(p_input jsonb)
returns text language sql immutable set search_path='' as $$
 select encode(extensions.digest(convert_to(p_input::text,'UTF8'),'sha256'),'hex');
$$;
revoke all on function private_business_continuity._input_sha256(jsonb) from public,anon,authenticated;

create or replace function private_business_continuity._assert_clean_input(p_input jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare v text:=coalesce(p_input::text,'');
begin
 if length(v)>65536 then raise exception 'BUSINESS_CONTINUITY_INPUT_TOO_LARGE'; end if;
 if v ~* '(sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|Bearer[[:space:]]+[^[:space:]"}]+|password[[:space:]]*[:=]|api[_-]?key[[:space:]]*[:=]|-----BEGIN[[:space:]]+[A-Za-z0-9 ]+[[:space:]]+PRIVATE KEY)'
 then raise exception 'BUSINESS_CONTINUITY_SENSITIVE_TEXT'; end if;
end; $$;
revoke all on function private_business_continuity._assert_clean_input(jsonb) from public,anon,authenticated;

create or replace function private_business_continuity._append_event(
 p_organization_id uuid,p_project_id uuid,p_task_id uuid,p_checkpoint_id uuid,
 p_actor_user_id uuid,p_event_kind text,p_payload_sha256 text
) returns table(context_seq bigint,event_sha256 text)
language plpgsql security definer set search_path='' as $$
declare v_state private_business_continuity.continuity_state%rowtype; v_seq bigint; v_hash text;
begin
 insert into private_business_continuity.continuity_state(organization_id) values(p_organization_id) on conflict do nothing;
 select * into v_state from private_business_continuity.continuity_state where organization_id=p_organization_id for update;
 v_seq:=v_state.context_seq+1;
 v_hash:=private_business_continuity._input_sha256(jsonb_build_object(
   'seq',v_seq,'eventKind',p_event_kind,'projectId',p_project_id,'taskId',p_task_id,
   'checkpointId',p_checkpoint_id,'actorUserId',p_actor_user_id,'payloadSha256',p_payload_sha256,'previousSha256',v_state.head_sha256));
 insert into private_business_continuity.events(organization_id,seq,event_kind,project_id,task_id,checkpoint_id,
   actor_user_id,payload_sha256,previous_sha256,event_sha256)
 values(p_organization_id,v_seq,p_event_kind,p_project_id,p_task_id,p_checkpoint_id,p_actor_user_id,p_payload_sha256,v_state.head_sha256,v_hash);
 update private_business_continuity.continuity_state set context_seq=v_seq,head_sha256=v_hash,updated_at=now() where organization_id=p_organization_id;
 return query select v_seq,v_hash;
end; $$;
revoke all on function private_business_continuity._append_event(uuid,uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;

create or replace function public.bc_task_start(
 p_project_id uuid,p_objective text,p_operation_id uuid,p_assigned_to_user_id uuid default null,p_tags text[] default '{}'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_access record; v_state private_business_continuity.continuity_state%rowtype; v_op private_business_continuity.operations%rowtype;
 v_input jsonb; v_sha text; v_task uuid; v_receipt jsonb; v_event record; v_objective text:=btrim(p_objective); v_tags text[]:=coalesce(p_tags,'{}');
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
 insert into private_business_continuity.continuity_state(organization_id) values(v_access.organization_id) on conflict do nothing;
 select * into v_state from private_business_continuity.continuity_state where organization_id=v_access.organization_id for update;
 select * into v_op from private_business_continuity.operations where organization_id=v_access.organization_id and operation_id=p_operation_id;
 if found then if v_op.operation_kind<>'task_start' or v_op.input_sha256<>v_sha then raise exception 'BUSINESS_IDEMPOTENCY_CONFLICT'; end if; return v_op.receipt; end if;
 insert into private_business_continuity.tasks(organization_id,project_id,objective,created_by_user_id,assigned_to_user_id,tags)
 values(v_access.organization_id,p_project_id,v_objective,v_access.member_user_id,p_assigned_to_user_id,v_tags) returning id into v_task;
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
 v_summary text:=btrim(p_summary); v_current text:=btrim(p_current_state); v_verify text:=nullif(btrim(p_verification),'');
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
   verification,decisions,facts,artifacts,source_user_id,source_runtime_node_id)
 values(v_access.organization_id,p_project_id,p_task_id,v_new_rev,v_summary,v_current,coalesce(p_next_actions,'{}'),v_verify,
   coalesce(p_decisions,'{}'),coalesce(p_facts,'{}'),coalesce(p_artifacts,'{}'),v_access.member_user_id,p_source_runtime_node_id) returning id into v_cp;
 update private_business_continuity.tasks set revision=v_new_rev where organization_id=v_access.organization_id and id=p_task_id;
 select * into v_event from private_business_continuity._append_event(v_access.organization_id,p_project_id,p_task_id,v_cp,v_access.member_user_id,'CHECKPOINT_APPENDED',v_sha);
 v_receipt:=jsonb_build_object('taskId',p_task_id,'checkpointId',v_cp,'revision',v_new_rev,'contextSeq',v_event.context_seq);
 insert into private_business_continuity.operations values(v_access.organization_id,p_operation_id,'checkpoint_append',v_sha,v_receipt,now());
 return v_receipt;
end; $$;

create or replace function public.bc_task_get(p_project_id uuid,p_task_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_access record; v_task private_business_continuity.tasks%rowtype; v_checkpoints jsonb;
begin
 select * into v_access from private_business_control._require_project_access(p_project_id);
 select * into v_task from private_business_continuity.tasks where organization_id=v_access.organization_id and project_id=p_project_id and id=p_task_id;
 if not found then raise exception 'BUSINESS_TASK_NOT_FOUND'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('checkpointId',c.id,'revision',c.task_revision,'summary',c.summary,'currentState',c.current_state,
   'nextActions',c.next_actions,'verification',c.verification,'decisions',c.decisions,'facts',c.facts,'artifacts',c.artifacts,'createdAt',c.created_at)
   order by c.task_revision),'[]'::jsonb) into v_checkpoints
 from private_business_continuity.checkpoints c where c.organization_id=v_access.organization_id and c.task_id=p_task_id;
 return jsonb_build_object('task',jsonb_build_object('taskId',v_task.id,'projectId',v_task.project_id,'objective',v_task.objective,'status',v_task.status,
   'revision',v_task.revision,'createdByUserId',v_task.created_by_user_id,'assignedToUserId',v_task.assigned_to_user_id,'tags',v_task.tags,
   'startedAt',v_task.started_at,'completedAt',v_task.completed_at),'checkpoints',v_checkpoints);
end; $$;

alter table private_business_continuity.schema_meta enable row level security;
alter table private_business_continuity.continuity_state enable row level security;
alter table private_business_continuity.tasks enable row level security;
alter table private_business_continuity.checkpoints enable row level security;
alter table private_business_continuity.operations enable row level security;
alter table private_business_continuity.events enable row level security;
revoke all on schema private_business_continuity from public,anon,authenticated;
revoke all on all tables in schema private_business_continuity from public,anon,authenticated;
revoke all on function public.bc_task_start(uuid,text,uuid,uuid,text[]) from public,anon;
revoke all on function public.bc_checkpoint_append(uuid,uuid,bigint,text,text,uuid,text[],text,text[],text[],text[],uuid) from public,anon;
revoke all on function public.bc_task_get(uuid,uuid) from public,anon;
grant execute on function public.bc_task_start(uuid,text,uuid,uuid,text[]) to authenticated;
grant execute on function public.bc_checkpoint_append(uuid,uuid,bigint,text,text,uuid,text[],text,text[],text[],text[],uuid) to authenticated;
grant execute on function public.bc_task_get(uuid,uuid) to authenticated;

commit;
