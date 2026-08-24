import "dotenv/config";
import { Client } from "pg";
const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const t = await c.query("select tablename from pg_tables where schemaname='public' order by 1");
console.log("TABLES:", t.rows.map(r => r.tablename).join(", "));
const e = await c.query("select enum_name from pg_enum group by 1 order by 1");
console.log("ENUMS:", e.rows.map(r => r.enum_name).join(", "));
await c.end();
