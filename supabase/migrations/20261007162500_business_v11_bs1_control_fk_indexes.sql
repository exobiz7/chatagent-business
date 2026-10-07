begin;

create index if not exists organization_members_user_idx
  on private_business_control.organization_members(user_id);

create index if not exists runtime_nodes_owner_member_idx
  on private_business_control.runtime_nodes(organization_id,owner_user_id);
create index if not exists runtime_nodes_enrolled_by_idx
  on private_business_control.runtime_nodes(organization_id,enrolled_by_user_id);
create index if not exists runtime_nodes_approved_by_idx
  on private_business_control.runtime_nodes(organization_id,approved_by_user_id);
create index if not exists runtime_nodes_revoked_by_idx
  on private_business_control.runtime_nodes(organization_id,revoked_by_user_id);

create index if not exists runtime_sessions_member_idx
  on private_business_control.runtime_sessions(organization_id,user_id);

create index if not exists logical_projects_created_by_idx
  on private_business_control.logical_projects(organization_id,created_by_user_id);

create index if not exists private_project_members_member_idx
  on private_business_control.private_project_members(organization_id,user_id);
create index if not exists private_project_members_granted_by_idx
  on private_business_control.private_project_members(organization_id,granted_by_user_id);

commit;
