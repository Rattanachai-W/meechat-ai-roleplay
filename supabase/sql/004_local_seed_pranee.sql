-- Local Docker seed: minimal published character for integration/security tests
-- Idempotent. Does not depend on Supabase Auth.
-- UUIDs use valid RFC variant/version bits so Zod uuid() accepts them.

insert into users (id, email, display_name)
values ('11111111-1111-4111-8111-111111111111', 'seed.pranee@example.com', 'Seed Creator')
on conflict (id) do nothing;

insert into creator_profiles (id, user_id, username)
values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'seed-creator'
)
on conflict (user_id) do nothing;

insert into characters (
  id, creator_id, name, slug, tagline, description, first_message,
  visibility, status, content_rating, published_at
)
values (
  '33333333-3333-4333-8333-333333333333',
  '22222222-2222-4222-8222-222222222222',
  'หมอปรานี',
  'pranee-doctor',
  'แพทย์ใจดีสำหรับทดสอบระบบ',
  'ตัวละคร seed สำหรับรัน integration / security tests บน local Docker Postgres',
  'สวัสดีค่ะ มีอะไรให้หมอช่วยไหมคะ?',
  'PUBLIC',
  'PUBLISHED',
  'GENERAL',
  now()
)
on conflict (slug) do update set
  id = excluded.id,
  creator_id = excluded.creator_id,
  status = excluded.status,
  visibility = excluded.visibility,
  published_at = coalesce(characters.published_at, excluded.published_at);
