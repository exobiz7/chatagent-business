begin;

create or replace function private_business_control._resolve_project_key(p_project_key text)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_member record; v_id uuid;
begin
  if p_project_key is null or p_project_key !~ '^[a-z0-9][a-z0-9._-]{0,63}$' then raise exception 'BUSINESS_PROJECT_INPUT_INVALID'; end if;
  select * into v_member from private_business_control._current_member();
  select id into v_id from private_business_control.logical_projects
   where organization_id=v_member.organization_id and project_key=p_project_key;
  if not found then raise exception 'BUSINESS_PROJECT_NOT_FOUND'; end if;
  perform 1 from private_business_control._require_project_access(v_id);
  return v_id;
end; $$;
revoke all on function private_business_control._resolve_project_key(text) from public,anon,authenticated;

create or replace function public.bc_task_start(
 p_project_key text,p_objective text,p_operation_id uuid,p_assigned_to_user_id uuid default null,p_tags text[] default '{}'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_result jsonb;
begin
 v_id:=private_business_control._resolve_project_key(p_project_key);
 v_result:=public.bc_task_start(v_id,p_objective,p_operation_id,p_assigned_to_user_id,p_tags);
 return jsonb_set(v_result,'{projectId}',to_jsonb(p_project_key),true);
end; $$;

create or replace function public.bc_checkpoint_append(
 p_project_key text,p_task_id uuid,p_expected_task_revision bigint,p_summary text,p_current_state text,p_operation_id uuid,
 p_next_actions text[] default '{}',p_verification text default null,p_decisions text[] default '{}',p_facts text[] default '{}',
 p_artifacts text[] default '{}',p_source_runtime_node_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 return public.bc_checkpoint_append(private_business_control._resolve_project_key(p_project_key),p_task_id,p_expected_task_revision,
   p_summary,p_current_state,p_operation_id,p_next_actions,p_verification,p_decisions,p_facts,p_artifacts,p_source_runtime_node_id);
end; $$;

create or replace function public.bc_task_complete(
 p_project_key text,p_task_id uuid,p_expected_task_revision bigint,p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 v_result:=public.bc_task_complete(private_business_control._resolve_project_key(p_project_key),p_task_id,p_expected_task_revision,p_operation_id);
 return jsonb_set(v_result,'{projectId}',to_jsonb(p_project_key),true);
end; $$;

create or replace function public.bc_task_get(p_project_key text,p_task_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 v_result:=public.bc_task_get(private_business_control._resolve_project_key(p_project_key),p_task_id);
 return jsonb_set(v_result,'{task,projectId}',to_jsonb(p_project_key),true);
end; $$;

create or replace function public.bc_project_context(p_project_key text,p_limit integer default 10)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 v_result:=public.bc_project_context(private_business_control._resolve_project_key(p_project_key),p_limit);
 return jsonb_set(v_result,'{projectId}',to_jsonb(p_project_key),true);
end; $$;

create or replace function public.bc_history_search(p_project_key text,p_query text,p_limit integer default 10)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 v_result:=public.bc_history_search(private_business_control._resolve_project_key(p_project_key),p_query,p_limit);
 return jsonb_set(v_result,'{projectId}',to_jsonb(p_project_key),true);
end; $$;

create or replace function public.bc_export_snapshot(p_project_key text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb; v_payload jsonb; v_digest text;
begin
 v_result:=public.bc_export_snapshot(private_business_control._resolve_project_key(p_project_key));
 v_payload:=(v_result-'logicalDigest'-'exportedAt'-'organizationContextSeq');
 v_payload:=jsonb_set(v_payload,'{project}',((v_payload->'project'::text)-'projectKey'::text)||jsonb_build_object('projectId',p_project_key),true);
 v_digest:='sha256:'||private_business_continuity._input_sha256(v_payload);
 return v_payload||jsonb_build_object('organizationContextSeq',v_result->'organizationContextSeq','exportedAt',v_result->'exportedAt',
   'integrityVerified',true,'logicalDigest',v_digest);
end; $$;

revoke all on function public.bc_task_start(text,text,uuid,uuid,text[]) from public,anon;
revoke all on function public.bc_checkpoint_append(text,uuid,bigint,text,text,uuid,text[],text,text[],text[],text[],uuid) from public,anon;
revoke all on function public.bc_task_complete(text,uuid,bigint,uuid) from public,anon;
revoke all on function public.bc_task_get(text,uuid) from public,anon;
revoke all on function public.bc_project_context(text,integer) from public,anon;
revoke all on function public.bc_history_search(text,text,integer) from public,anon;
revoke all on function public.bc_export_snapshot(text) from public,anon;
grant execute on function public.bc_task_start(text,text,uuid,uuid,text[]) to authenticated;
grant execute on function public.bc_checkpoint_append(text,uuid,bigint,text,text,uuid,text[],text,text[],text[],text[],uuid) to authenticated;
grant execute on function public.bc_task_complete(text,uuid,bigint,uuid) to authenticated;
grant execute on function public.bc_task_get(text,uuid) to authenticated;
grant execute on function public.bc_project_context(text,integer) to authenticated;
grant execute on function public.bc_history_search(text,text,integer) to authenticated;
grant execute on function public.bc_export_snapshot(text) to authenticated;

commit;
