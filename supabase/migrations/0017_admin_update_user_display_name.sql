create function public.admin_update_user_display_name(target_user_id uuid, new_display_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;
  update public.users set display_name = new_display_name where id = target_user_id;
end;
$$;

revoke execute on function public.admin_update_user_display_name(uuid, text) from public, anon;
grant execute on function public.admin_update_user_display_name(uuid, text) to authenticated;
