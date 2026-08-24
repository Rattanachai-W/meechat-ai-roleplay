-- ═══════════════════════════════════════════════════════════════
-- MeeChat — Supabase setup SQL (รันใน Supabase SQL Editor หรือผ่าน supabase CLI)
--
-- ทำไมต้องมีไฟล์นี้: Prisma จัดการโครงสร้างตาราง (migrations) ส่วน auth triggers,
-- RLS policies และสิทธิ์ของ PostgREST ต้องตั้งด้วย SQL โดยตรง
--
-- หมายเหตุสถาปัตยกรรม:
-- - Server เข้าถึง DB ผ่าน Prisma (postgres connection) ซึ่งเป็น table owner → bypass RLS
--   business rule เรื่อง ownership จึง enforce ซ้ำใน application layer เสมอ
-- - RLS นี้ป้องกันเส้นทาง PostgREST (anon / authenticated keys) โดยเฉพาะ
-- ═══════════════════════════════════════════════════════════════

begin;

-- ─────────────────── 1. Auto-create user records ───────────────────
-- เมื่อ user สมัครผ่าน Supabase Auth ให้สร้างแถวใน public.users + energy_wallet อัตโนมัติ

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- กัน unique(users.email) ชนกับ orphan row: account เดิมอาจถูกลบเฉพาะฝั่ง auth.users
  -- (เช่น ผู้ใช้ลบบัญชี/reset dev environment) ทิ้ง public.users ค้างไว้คนละ id
  delete from public.users where email = new.email and id <> new.id;

  insert into public.users (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, 'user'), '@', 1)),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;

  insert into public.energy_wallets (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────── 2. Enable RLS ───────────────────

alter table public.users                  enable row level security;
alter table public.user_personas          enable row level security;
alter table public.creator_profiles       enable row level security;
alter table public.characters             enable row level security;
alter table public.tags                   enable row level security;
alter table public.character_tags         enable row level security;
alter table public.character_examples     enable row level security;
alter table public.conversations          enable row level security;
alter table public.messages               enable row level security;
alter table public.memories               enable row level security;
alter table public.conversation_summaries enable row level security;
alter table public.favorites              enable row level security;
alter table public.character_likes        enable row level security;
alter table public.creator_follows        enable row level security;
alter table public.energy_wallets         enable row level security;
alter table public.energy_transactions    enable row level security;
alter table public.ai_models              enable row level security;
alter table public.ai_usage_logs          enable row level security;

-- ─────────────────── 3. Policies ───────────────────

-- users: authenticated อ่าน profile พื้นฐานได้ (creator page), แก้ได้เฉพาะของตัวเอง
drop policy if exists users_select_authenticated on public.users;
create policy users_select_authenticated on public.users
  for select to authenticated using (true);

drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- user_personas: เจ้าของเท่านั้น
drop policy if exists personas_owner_all on public.user_personas;
create policy personas_owner_all on public.user_personas
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- creator_profiles: ทุกคนอ่านได้ (public directory), เจ้าของเขียนได้
drop policy if exists creator_profiles_select_all on public.creator_profiles;
create policy creator_profiles_select_all on public.creator_profiles
  for select using (true);

drop policy if exists creator_profiles_write_own on public.creator_profiles;
create policy creator_profiles_write_own on public.creator_profiles
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- characters: PUBLIC/UNLISTED อ่านได้ทุกคน, PRIVATE อ่านได้เฉพาะ owner
-- (UNLISTED = ไม่โชว์ใน listing แต่เข้าผ่านลิงก์ได้ — การกรอง listing ทำฝั่ง API)
drop policy if exists characters_select on public.characters;
create policy characters_select on public.characters
  for select using (
    visibility in ('PUBLIC', 'UNLISTED')
    or exists (
      select 1 from public.creator_profiles cp
      where cp.id = characters.creator_id and cp.user_id = auth.uid()
    )
  );

drop policy if exists characters_insert_own on public.characters;
create policy characters_insert_own on public.characters
  for insert to authenticated with check (
    exists (
      select 1 from public.creator_profiles cp
      where cp.id = characters.creator_id and cp.user_id = auth.uid()
    )
  );

drop policy if exists characters_update_own on public.characters;
create policy characters_update_own on public.characters
  for update to authenticated
  using (
    exists (
      select 1 from public.creator_profiles cp
      where cp.id = characters.creator_id and cp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.creator_profiles cp
      where cp.id = characters.creator_id and cp.user_id = auth.uid()
    )
  );

drop policy if exists characters_delete_own on public.characters;
create policy characters_delete_own on public.characters
  for delete to authenticated
  using (
    exists (
      select 1 from public.creator_profiles cp
      where cp.id = characters.creator_id and cp.user_id = auth.uid()
    )
  );

-- tags / character_tags: อ่านได้ทุกคน (เขียนผ่าน Prisma เท่านั้น)
drop policy if exists tags_select_all on public.tags;
create policy tags_select_all on public.tags for select using (true);

drop policy if exists character_tags_select_all on public.character_tags;
create policy character_tags_select_all on public.character_tags for select using (true);

-- character_examples: อ่านได้ถ้า character ที่ผูกอยู่อ่านได้
drop policy if exists character_examples_select on public.character_examples;
create policy character_examples_select on public.character_examples
  for select using (
    exists (
      select 1 from public.characters c
      left join public.creator_profiles cp on cp.id = c.creator_id
      where c.id = character_examples.character_id
        and (c.visibility in ('PUBLIC', 'UNLISTED') or cp.user_id = auth.uid())
    )
  );

-- conversations: เจ้าของเท่านั้น
drop policy if exists conversations_owner_all on public.conversations;
create policy conversations_owner_all on public.conversations
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- messages / memories / conversation_summaries: เจ้าของ conversation เท่านั้น
drop policy if exists messages_owner_all on public.messages;
create policy messages_owner_all on public.messages
  for all to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

drop policy if exists memories_owner_all on public.memories;
create policy memories_owner_all on public.memories
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists summaries_owner_all on public.conversation_summaries;
create policy summaries_owner_all on public.conversation_summaries
  for all to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_summaries.conversation_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_summaries.conversation_id and c.user_id = auth.uid()
    )
  );

-- favorites: เจ้าของจัดการเอง
drop policy if exists favorites_owner_all on public.favorites;
create policy favorites_owner_all on public.favorites
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- character_likes: ทุกคนอ่าน (นับ like), เจ้าของจัดการเอง
drop policy if exists likes_select_all on public.character_likes;
create policy likes_select_all on public.character_likes
  for select using (true);

drop policy if exists likes_owner_all on public.character_likes;
create policy likes_owner_all on public.character_likes
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- creator_follows: ผู้ติดตามจัดการเอง
drop policy if exists follows_owner_all on public.creator_follows;
create policy follows_owner_all on public.creator_follows
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- energy: อ่านได้เฉพาะเจ้าของ — เขียวทุกกรณีทำผ่าน server (Prisma) เท่านั้น
drop policy if exists wallets_select_own on public.energy_wallets;
create policy wallets_select_own on public.energy_wallets
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists transactions_select_own on public.energy_transactions;
create policy transactions_select_own on public.energy_transactions
  for select to authenticated using (auth.uid() = user_id);

-- ai_models: authenticated อ่าน model ที่เปิดใช้งาน
drop policy if exists ai_models_select_enabled on public.ai_models;
create policy ai_models_select_enabled on public.ai_models
  for select to authenticated using ("is_enabled" = true);

-- ai_usage_logs: ไม่เปิด policy ใดๆ → บล็อกทุก access จาก PostgREST (อ่าน/เขียนผ่าน server เท่านั้น)

-- (reports table ถูกลบ 2026-08-24 — ระบบ moderation ยังไม่ implement; ดู backups/reports-table-backup.sql)

commit;
