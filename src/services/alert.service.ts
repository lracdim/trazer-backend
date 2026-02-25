import { eq, desc, and, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { alerts, shifts } from "../db/schema.js";

// Alert types
export type AlertType = "out_of_bounds" | "idle" | "signal_lost" | "sos";

/**
 * Create a new alert and return it.
 */
export async function createAlert(shiftId: string, type: AlertType, message: string) {
    // Avoid duplicate unresolved alerts of the same type for the same shift
    const existing = await db.query.alerts.findFirst({
        where: and(
            eq(alerts.shiftId, shiftId),
            eq(alerts.type, type),
            isNull(alerts.resolvedAt)
        ),
    });

    if (existing) return existing; // don't spam duplicate alerts

    const [alert] = await db
        .insert(alerts)
        .values({ shiftId, type, message })
        .returning();

    return alert;
}

/**
 * Resolve an alert.
 */
export async function resolveAlert(alertId: string) {
    const [updated] = await db
        .update(alerts)
        .set({ resolvedAt: new Date() })
        .where(eq(alerts.id, alertId))
        .returning();

    return updated;
}

/**
 * Get alerts with optional filters.
 */
export async function getAlerts(filters?: { type?: string; resolved?: boolean }) {
    const conditions = [];

    if (filters?.type) {
        conditions.push(eq(alerts.type, filters.type));
    }
    if (filters?.resolved === false) {
        conditions.push(isNull(alerts.resolvedAt));
    }
    if (filters?.resolved === true) {
        conditions.push(sql`${alerts.resolvedAt} IS NOT NULL`);
    }

    const result = await db.query.alerts.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: {
            shift: {
                with: {
                    guard: true,
                    site: true,
                },
            },
        },
        orderBy: [desc(alerts.createdAt)],
        limit: 100,
    });

    return result.map((a) => ({
        id: a.id,
        type: a.type,
        message: a.message,
        createdAt: a.createdAt,
        resolvedAt: a.resolvedAt,
        shift: {
            id: a.shift.id,
            guardName: a.shift.guard.name,
            siteName: a.shift.site?.name || "Unknown Site",
        },
    }));
}

/**
 * Get unresolved alert count.
 */
export async function getUnresolvedAlertCount(): Promise<number> {
    const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(alerts)
        .where(isNull(alerts.resolvedAt));

    return Number(result[0].count);
}
