-- Keep linked assistant statuses consistent at the database boundary.
create or replace function private.cancel_linked_assistant_schedules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.schedules
  set status = 'cancelled'
  where kind = 'assistant'
    and parent_schedule_id = new.id
    and status <> 'cancelled';

  return new;
end;
$$;

revoke all on function private.cancel_linked_assistant_schedules()
from public, anon, authenticated, service_role;

create trigger schedules_cancel_linked_assistants
after update of status on public.schedules
for each row
when (
  old.status is distinct from new.status
  and new.kind = 'lecture'
  and new.status = 'cancelled'
)
execute function private.cancel_linked_assistant_schedules();

create or replace function private.cancel_assistant_for_cancelled_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'assistant'
    and new.parent_schedule_id is not null
    and exists (
      select 1
      from public.schedules as parent
      where parent.id = new.parent_schedule_id
        and parent.kind = 'lecture'
        and parent.status = 'cancelled'
    )
  then
    new.status = 'cancelled';
  end if;

  return new;
end;
$$;

revoke all on function private.cancel_assistant_for_cancelled_parent()
from public, anon, authenticated, service_role;

create trigger schedules_cancel_assistant_on_insert
before insert on public.schedules
for each row
execute function private.cancel_assistant_for_cancelled_parent();

create trigger schedules_cancel_assistant_on_update
before update of kind, parent_schedule_id, status on public.schedules
for each row
execute function private.cancel_assistant_for_cancelled_parent();

update public.schedules as assistant
set status = 'cancelled'
from public.schedules as lecture
where assistant.kind = 'assistant'
  and assistant.status <> 'cancelled'
  and assistant.parent_schedule_id = lecture.id
  and lecture.kind = 'lecture'
  and lecture.status = 'cancelled';
