create function public.get_admin_stats()
returns table (favorites_count bigint, trips_count bigint)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;
  return query
    select
      (select count(*) from public.favorites) as favorites_count,
      (select count(*) from public.trips) as trips_count;
end;
$$;

revoke execute on function public.get_admin_stats() from public, anon;
grant execute on function public.get_admin_stats() to authenticated;
