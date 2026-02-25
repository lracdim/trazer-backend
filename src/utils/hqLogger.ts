import { db } from "../db/index.js";
import { adminActivityLogs } from "../db/schema.js";

interface LogAdminActionParams {
    adminId: string;
    actionType: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
}

/**
 * Immutable audit logger for Trazer HQ platform administrators.
 * This logs every critical action to the `admin_activity_logs` table.
 */
export async function logAdminAction(params: LogAdminActionParams) {
    try {
        await db.insert(adminActivityLogs).values({
            adminId: params.adminId,
            actionType: params.actionType,
            entityType: params.entityType || null,
            entityId: params.entityId || null,
            metadata: params.metadata || null,
            ipAddress: params.ipAddress || null,
            userAgent: params.userAgent || null,
        });
    } catch (error) {
        // We log to console but ideally should hook into Sentry/Datadog
        // DO NOT throw error to prevent failing the main request if logging fails,
        // although in highly secure setups, failing the audit might require failing the request.
        console.error("CRITICAL: Failed to write to admin_activity_logs", error);
    }
}
