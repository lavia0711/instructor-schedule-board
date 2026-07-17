create index profiles_instructor_name_idx on public.profiles (instructor_name);
create index schedules_created_by_idx on public.schedules (created_by);
create index schedules_updated_by_idx on public.schedules (updated_by);
create index workspace_settings_updated_by_idx on public.workspace_settings (updated_by);
