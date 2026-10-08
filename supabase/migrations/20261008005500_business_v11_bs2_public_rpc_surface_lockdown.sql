begin;

-- UUID overloads remain internal implementation details for SECURITY DEFINER project-key adapters.
-- Authenticated clients use only the public logical project-key overloads.
revoke execute on function public.bc_task_start(uuid,text,uuid,uuid,text[]) from authenticated;
revoke execute on function public.bc_checkpoint_append(uuid,uuid,bigint,text,text,uuid,text[],text,text[],text[],text[],uuid) from authenticated;
revoke execute on function public.bc_task_complete(uuid,uuid,bigint,uuid) from authenticated;
revoke execute on function public.bc_task_get(uuid,uuid) from authenticated;
revoke execute on function public.bc_project_context(uuid,integer) from authenticated;
revoke execute on function public.bc_history_search(uuid,text,integer) from authenticated;
revoke execute on function public.bc_export_snapshot(uuid) from authenticated;

commit;
