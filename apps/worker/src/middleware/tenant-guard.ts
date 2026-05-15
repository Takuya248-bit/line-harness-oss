const TENANT_TABLES = {
  automations: 'automations',
  scenarios: 'scenarios',
} as const;

export type TenantOwnedTable = keyof typeof TENANT_TABLES;

export class TenantOwnershipError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404,
    message: string,
  ) {
    super(message);
    this.name = 'TenantOwnershipError';
  }
}

export function requireLineAccountId(lineAccountId: string | null | undefined): string {
  if (!lineAccountId) {
    throw new TenantOwnershipError(400, 'lineAccountId is required');
  }
  return lineAccountId;
}

export async function assertTenantOwnership(
  db: D1Database,
  table: TenantOwnedTable,
  id: string,
  expectedAccountId: string,
): Promise<void> {
  const tableName = TENANT_TABLES[table];
  const row = await db
    .prepare(`SELECT line_account_id FROM ${tableName} WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<{ line_account_id: string | null }>();

  if (!row) {
    throw new TenantOwnershipError(404, 'Not found');
  }

  if (row.line_account_id !== expectedAccountId) {
    throw new TenantOwnershipError(403, 'tenant mismatch');
  }
}

export function tenantErrorResponse(error: unknown): { status: 400 | 403 | 404; body: { success: false; error: string } } | null {
  if (!(error instanceof TenantOwnershipError)) return null;
  return {
    status: error.status,
    body: { success: false, error: error.message },
  };
}
