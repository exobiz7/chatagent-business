-- ChatAgent Business v1.1 B-S1B staging-only bootstrap.
-- Operator-controlled, one-time data initialization. NOT a migration and NOT a runtime RPC.
-- Fails closed unless the isolated staging project has exactly one confirmed,
-- non-anonymous Auth user and zero Business organizations/members.

do $$
declare
  v_user uuid;
  v_eligible_count integer;
  v_org_count integer;
  v_member_count integer;
  v_org uuid;
begin
  select count(*) into v_eligible_count
  from auth.users
  where confirmed_at is not null
    and coalesce(is_anonymous,false)=false;

  select count(*) into v_org_count
  from private_business_control.organizations;

  select count(*) into v_member_count
  from private_business_control.organization_members;

  if v_eligible_count <> 1 then
    raise exception 'BUSINESS_BOOTSTRAP_AUTH_USER_COUNT';
  end if;
  if v_org_count <> 0 or v_member_count <> 0 then
    raise exception 'BUSINESS_BOOTSTRAP_ALREADY_INITIALIZED';
  end if;

  select id into strict v_user
  from auth.users
  where confirmed_at is not null
    and coalesce(is_anonymous,false)=false;

  insert into private_business_control.organizations(slug,display_name)
  values ('chatagent-business-v11-bs0','ChatAgent Business')
  returning id into v_org;

  insert into private_business_control.organization_members(
    organization_id,user_id,role,member_state
  ) values (v_org,v_user,'ADMIN','ACTIVE');

  insert into private_business_control.control_state(organization_id)
  values (v_org);
end;
$$;
