-- Invite links: every account gets a short code, and a friend who signs up through ?ref=<code> is recorded as invited
-- by that account. This records who invited whom; paying the reward comes later (rewarded_at stays empty until then).
-- Only the server writes these rows; a person can read the invites they sent.

alter table public.profiles
  add column invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references auth.users on delete cascade,
  -- A person can only be invited once.
  invitee_id uuid not null unique references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  -- Set when the reward is paid. Not used yet.
  rewarded_at timestamptz,
  check (inviter_id <> invitee_id)
);
create index invites_inviter on public.invites (inviter_id, created_at desc);
alter table public.invites enable row level security;
create policy "own invites read" on public.invites for select using (auth.uid() = inviter_id);
revoke insert, update, delete on public.invites from anon, authenticated;

-- Records that p_invitee came in through p_code. Returns true if it was recorded now; false for an unknown code, the
-- person's own code, or someone who was already invited.
create function public.record_invite(p_invitee uuid, p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_inviter uuid; v_id uuid;
begin
  select id into v_inviter from public.profiles where invite_code = lower(p_code);
  if v_inviter is null or v_inviter = p_invitee then return false; end if;
  insert into public.invites (inviter_id, invitee_id) values (v_inviter, p_invitee)
  on conflict (invitee_id) do nothing
  returning id into v_id;
  return v_id is not null;
end $$;

revoke all on function public.record_invite(uuid, text) from public, anon, authenticated;
grant execute on function public.record_invite(uuid, text) to service_role;
