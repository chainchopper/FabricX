import { Pool } from "pg";

// Plain Postgres via DATABASE_URL (spec §3: no vendor-specific anything).
let pool: Pool | null = null;

export function db(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    pool = new Pool({ connectionString: url, max: 5 });
  }
  return pool;
}

export async function q<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const r = await db().query(sql, params as never[]);
  return r.rows as T[];
}

export async function q1<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}

/** Every portal mutation writes an audit row (spec §3, admin_audit_log). */
export async function audit(
  actor: string,
  action: string,
  entity: string,
  entityId: string | null,
  before: unknown,
  after: unknown
): Promise<void> {
  await q(
    `INSERT INTO admin_audit_log (actor, action, entity, entity_id, before, after)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      actor,
      action,
      entity,
      entityId,
      before === undefined ? null : JSON.stringify(before),
      after === undefined ? null : JSON.stringify(after),
    ]
  );
}

export function newId(): string {
  return crypto.randomUUID();
}
