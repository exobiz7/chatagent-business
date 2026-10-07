begin;

create schema if not exists private_business_control;

revoke all on schema private_business_control from public;
revoke all on schema private_business_control from anon;
revoke all on schema private_business_control from authenticated;

create table if not exists private_business_control.schema_meta (
  singleton boolean primary key default true check (singleton),
  schema_version integer not null check (schema_version >= 1),
  contract_version integer not null check (contract_version >= 1),
  installed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into private_business_control.schema_meta(singleton,schema_version,contract_version)
values (true,1,1)
on conflict (singleton) do update
set schema_version=excluded.schema_version,
    contract_version=excluded.contract_version,
    updated_at=now();

create table if not exists private_business_control.organizations (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 128),
  policy_revision bigint not null default 1 check (policy_revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private_business_control.organization_members (
  organization_id uuid not null references private_business_control.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('ADMIN','PM','MEMBER')),
  member_state text not null default 'ACTIVE' check (member_state in ('ACTIVE','REVOKED')),
  joined_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (organization_id,user_id),
  check ((member_state='ACTIVE' and revoked_at is null) or member_state='REVOKED')
);

create table if not exists private_business_control.control_state (
  organization_id uuid primary key references private_business_control.organizations(id) on delete cascade,
  policy_revision bigint not null default 1 check (policy_revision >= 1),
  authorization_lease_seconds integer not null default 300 check (authorization_lease_seconds between 30 and 3600),
  updated_at timestamptz not null default now()
);

create table if not exists private_business_control.runtime_nodes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references private_business_control.organizations(id) on delete cascade,
  node_name text not null check (length(btrim(node_name)) between 1 and 128),
  node_type text not null check (node_type in ('PERSONAL_NODE','SHARED_NODE')),
  lifecycle text not null default 'PENDING' check (lifecycle in ('PENDING','APPROVED','REVOKED')),
  owner_user_id uuid,
  shared_host_power_enabled boolean not null default false,
  enrolled_by_user_id uuid not null,
  approved_by_user_id uuid,
  revoked_by_user_id uuid,
  enrolled_at timestamptz not null default now(),
  approved_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  unique (organization_id,id),
  unique (organization_id,node_name),
  foreign key (organization_id,owner_user_id)
    references private_business_control.organization_members(organization_id,user_id),
  foreign key (organization_id,enrolled_by_user_id)
    references private_business_control.organization_members(organization_id,user_id),
  foreign key (organization_id,approved_by_user_id)
    references private_business_control.organization_members(organization_id,user_id),
  foreign key (organization_id,revoked_by_user_id)
    references private_business_control.organization_members(organization_id,user_id),
  check ((node_type='PERSONAL_NODE' and owner_user_id is not null and shared_host_power_enabled=false)
      or (node_type='SHARED_NODE' and owner_user_id is null)),
  check ((lifecycle='PENDING' and approved_at is null and revoked_at is null)
      or (lifecycle='APPROVED' and approved_at is not null and revoked_at is null)
      or (lifecycle='REVOKED' and revoked_at is not null))
);

create table if not exists private_business_control.runtime_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references private_business_control.organizations(id) on delete cascade,
  runtime_node_id uuid not null,
  user_id uuid not null,
  session_state text not null default 'ACTIVE' check (session_state in ('ACTIVE','EXPIRED','REVOKED')),
  lease_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  foreign key (organization_id,runtime_node_id)
    references private_business_control.runtime_nodes(organization_id,id) on delete cascade,
  foreign key (organization_id,user_id)
    references private_business_control.organization_members(organization_id,user_id),
  check ((session_state='REVOKED' and revoked_at is not null) or session_state<>'REVOKED')
);

create table if not exists private_business_control.logical_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references private_business_control.organizations(id) on delete cascade,
  project_key text not null check (project_key ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 128),
  collaboration_mode text not null default 'TEAM' check (collaboration_mode in ('TEAM','PRIVATE')),
  project_profile text not null default 'STANDARD' check (project_profile in ('READ_ONLY','SAFE','STANDARD')),
  policy_revision bigint not null default 1 check (policy_revision >= 1),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,project_key),
  foreign key (organization_id,created_by_user_id)
    references private_business_control.organization_members(organization_id,user_id)
);

create table if not exists private_business_control.private_project_members (
  organization_id uuid not null,
  project_id uuid not null,
  user_id uuid not null,
  granted_by_user_id uuid not null,
  granted_at timestamptz not null default now(),
  primary key (organization_id,project_id,user_id),
  foreign key (organization_id,project_id)
    references private_business_control.logical_projects(organization_id,id) on delete cascade,
  foreign key (organization_id,user_id)
    references private_business_control.organization_members(organization_id,user_id) on delete cascade,
  foreign key (organization_id,granted_by_user_id)
    references private_business_control.organization_members(organization_id,user_id)
);

create table if not exists private_business_control.operations (
  organization_id uuid not null references private_business_control.organizations(id) on delete cascade,
  operation_id uuid not null,
  operation_kind text not null check (operation_kind ~ '^[a-z][a-z0-9_]{2,80}$'),
  input_sha256 text not null check (input_sha256 ~ '^[a-f0-9]{64}$'),
  receipt jsonb not null,
  created_at timestamptz not null default now(),
  primary key (organization_id,operation_id)
);

create index if not exists runtime_nodes_org_lifecycle_idx
  on private_business_control.runtime_nodes(organization_id,lifecycle);
create index if not exists runtime_sessions_node_state_idx
  on private_business_control.runtime_sessions(organization_id,runtime_node_id,session_state);
create index if not exists logical_projects_org_mode_idx
  on private_business_control.logical_projects(organization_id,collaboration_mode);

alter table private_business_control.schema_meta enable row level security;
alter table private_business_control.organizations enable row level security;
alter table private_business_control.organization_members enable row level security;
alter table private_business_control.control_state enable row level security;
alter table private_business_control.runtime_nodes enable row level security;
alter table private_business_control.runtime_sessions enable row level security;
alter table private_business_control.logical_projects enable row level security;
alter table private_business_control.private_project_members enable row level security;
alter table private_business_control.operations enable row level security;

revoke all on all tables in schema private_business_control from public;
revoke all on all tables in schema private_business_control from anon;
revoke all on all tables in schema private_business_control from authenticated;
revoke all on all sequences in schema private_business_control from public;
revoke all on all sequences in schema private_business_control from anon;
revoke all on all sequences in schema private_business_control from authenticated;

create or replace function public.bc_schema_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private_business_control
as $$
  select jsonb_build_object(
    'schema','private_business_control',
    'schemaVersion',m.schema_version,
    'contractVersion',m.contract_version,
    'organizationInitialized',exists(select 1 from organizations),
    'tableCount',9
  )
  from schema_meta m
  where m.singleton=true;
$$;

revoke all on function public.bc_schema_status() from public;
revoke all on function public.bc_schema_status() from anon;
grant execute on function public.bc_schema_status() to authenticated;

commit;
