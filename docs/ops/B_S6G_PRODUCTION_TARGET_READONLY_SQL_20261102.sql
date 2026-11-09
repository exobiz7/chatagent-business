-- B-S6G owner-approved dedicated PRODUCTION database only.
-- READ-ONLY INSPECTION. Never run on staging or Personal's database.
-- Uses transaction read only; abort on missing schema or insufficient SQL permissions.
-- Execute through an authorized private SQL console only after production identity proof.
begin transaction read only;

-- 1. Confirm schema contract is installed.
select 'control_schema' as gate, schema_version, contract_version
from private_business_control.schema_meta where singleton is true;

select 'continuity_schema' as gate, schema_version, contract_version
from private_business_continuity.schema_meta where singleton is true;

-- 2. Confirm the APPLICATION organization slug, not the Supabase account/org slug.
-- No member identifiers or credentials are returned.
select 'application_org_identity' as gate,
 count(*) filter (where slug='release-org') as matching_app_orgs,
 count(*) as total_app_orgs
from private_business_control.organizations;

-- 3. Active administrative membership exists (does not substitute for verifying the exact operator).
select 'active_admin_count' as gate, count(*) as active_admin_members
from private_business_control.organization_members m
join private_business_control.organizations o on o.id=m.organization_id
where o.slug='release-org' and m.role='ADMIN' and m.member_state='ACTIVE' and m.revoked_at is null;

-- 4. Migration target must be EMPTY; not merely an empty visible public schema.
select 'target_rows' as gate,
 (select count(*) from private_business_control.logical_projects) as projects,
 (select count(*) from private_business_control.private_project_members) as project_memberships,
 (select count(*) from private_business_continuity.continuity_state) as continuity_state,
 (select count(*) from private_business_continuity.tasks) as tasks,
 (select count(*) from private_business_continuity.checkpoints) as checkpoints,
 (select count(*) from private_business_continuity.operations) as continuity_operations,
 (select count(*) from private_business_continuity.events) as continuity_events,
 (select count(*) from private_business_control.operations) as control_operations,
 (select count(*) from private_business_control.runtime_nodes) as runtime_nodes,
 (select count(*) from private_business_control.runtime_sessions) as runtime_sessions;

-- 5. Before import, importer should not be installed; if installed unexpectedly, halt.
-- After approved importer creation, separately require anon/authenticated/PUBLIC cannot execute.
select 'importer_present_pre_import' as gate,
 to_regprocedure('public.bc_import_snapshot(jsonb,uuid)') is not null as importer_present;

commit;
