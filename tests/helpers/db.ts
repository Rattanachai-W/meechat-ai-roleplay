import pg from "pg";
import { DATABASE_URL } from "./env";

let client: pg.Client | null = null;

export function db(): pg.Client {
  if (!client) client = new pg.Client({ connectionString: DATABASE_URL });
  return client;
}

export async function connectDb(): Promise<void> {
  await db().connect();
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.end().catch(() => {});
    client = null;
  }
}

export function q<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return db().query(text, params);
}
