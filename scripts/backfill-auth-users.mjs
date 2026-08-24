/**
 * Backfill public.users + energy_wallets จาก auth.users
 *
 * ใช้เมื่อมี user ที่สมัครก่อน trigger handle_new_user ติดตั้ง (หรือ trigger พลาด)
 * → login ได้แต่ทุก endpoint ที่ FK ไป public.users เด้ง P2003 (เช่น PATCH /api/creator/me)
 *
 * รัน: node scripts/backfill-auth-users.mjs   (idempotent — on conflict do nothing)
 */
import "dotenv/config";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const users = await client.query(`
  with missing as (
    select au.id, au.email, au.raw_user_meta_data
    from auth.users au
    left join public.users pu on pu.id = au.id
    where pu.id is null
  )
  insert into public.users (id, email, display_name)
  select id, email,
    coalesce(raw_user_meta_data ->> 'display_name', split_part(coalesce(email, 'user'), '@', 1))
  from missing
  on conflict (id) do nothing
  returning id, email`);

const wallets = await client.query(`
  insert into energy_wallets (user_id)
  select au.id from auth.users au
  left join energy_wallets ew on ew.user_id = au.id
  where ew.user_id is null
  on conflict (user_id) do nothing
  returning user_id`);

const still = await client.query(`
  select count(*)::int n from auth.users au
  left join public.users pu on pu.id = au.id
  where pu.id is null`);

console.log(`backfilled users=${users.rows.length} wallets=${wallets.rows.length} still_missing=${still.rows[0].n}`);
if (users.rows.length) console.log(users.rows.map((r) => `  + ${r.email}`).join("\n"));
await client.end();
