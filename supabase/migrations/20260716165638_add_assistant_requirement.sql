alter table public.schedules
  add column assistant_required boolean not null default false;

update public.schedules
set assistant_required = true
where kind = 'lecture';

alter table public.schedules
  add constraint schedules_assistant_requirement_lecture_only
  check (kind = 'lecture' or assistant_required = false);
