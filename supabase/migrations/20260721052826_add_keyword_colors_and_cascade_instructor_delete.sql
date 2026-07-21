alter table public.workspace_settings
  add column lecture_keyword_colors jsonb not null default jsonb_build_object(
    '제미나이', '#4285f4',
    '클로드', '#d97757'
  );

alter table public.schedules
  drop constraint schedules_parent_schedule_id_fkey,
  add constraint schedules_parent_schedule_id_fkey
    foreign key (parent_schedule_id)
    references public.schedules(id)
    on delete cascade;

alter table public.schedules
  drop constraint schedules_instructor_fkey,
  add constraint schedules_instructor_fkey
    foreign key (instructor)
    references public.instructors(name)
    on update cascade
    on delete cascade;
