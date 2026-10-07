begin;

create index if not exists continuity_tasks_created_by_idx
  on private_business_continuity.tasks(organization_id,created_by_user_id);
create index if not exists continuity_tasks_assigned_to_idx
  on private_business_continuity.tasks(organization_id,assigned_to_user_id);
create index if not exists continuity_tasks_completed_by_idx
  on private_business_continuity.tasks(organization_id,completed_by_user_id);
create index if not exists continuity_checkpoints_project_idx
  on private_business_continuity.checkpoints(organization_id,project_id);
create index if not exists continuity_checkpoints_source_user_idx
  on private_business_continuity.checkpoints(organization_id,source_user_id);
create index if not exists continuity_checkpoints_source_node_idx
  on private_business_continuity.checkpoints(organization_id,source_runtime_node_id);
create index if not exists continuity_events_task_idx
  on private_business_continuity.events(organization_id,task_id);
create index if not exists continuity_events_checkpoint_idx
  on private_business_continuity.events(organization_id,checkpoint_id);
create index if not exists continuity_events_actor_idx
  on private_business_continuity.events(organization_id,actor_user_id);

commit;
