import { db } from "../db/index.js";
import { auditLogs } from "../db/schema.js";

/**
 * Log an admin action to the audit_logs table.
 * Called from service layer after important operations.
 */
export async function logAudit(input: {
    userId: string;
    organizationId?: string | null;
    action: string;
    entityType?: string;
    entityId?: string;
    ipAddress?: string;
}) {
    await db.insert(auditLogs).values({
        userId: input.userId,
        organizationId: input.organizationId ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        ipAddress: input.ipAddress ?? null,
    });
}
