import { Request, Response, NextFunction } from "express";
import { db } from "../db/index.js";
import { billing, usageMetrics } from "../db/schema.js";
import { sql, eq } from "drizzle-orm";

export async function getMrr(req: Request, res: Response, next: NextFunction) {
    try {
        const [result] = await db.select({ totalMrr: sql<string>`sum(${billing.price})` }).from(billing)
            .where(eq(billing.status, 'active'));

        res.status(200).json({ success: true, data: { mrr: result.totalMrr || "0.00" } });
    } catch (error) {
        next(error);
    }
}

export async function getPlanDistribution(req: Request, res: Response, next: NextFunction) {
    try {
        const distribution = await db.select({
            planName: billing.planName,
            count: sql<number>`count(*)`
        }).from(billing).groupBy(billing.planName);

        res.status(200).json({ success: true, data: distribution });
    } catch (error) {
        next(error);
    }
}

export async function getOverdueAccounts(req: Request, res: Response, next: NextFunction) {
    try {
        const overdue = await db.query.billing.findMany({
            where: eq(billing.status, 'past_due'),
            with: { organization: true }
        });

        res.status(200).json({ success: true, data: overdue });
    } catch (error) {
        next(error);
    }
}

export async function getRevenueTrend(req: Request, res: Response, next: NextFunction) {
    try {
        // A real system would group billings by created_at.
        // For Postgres, we can sum billing price by date_trunc('month', created_at)
        // Since sqlite and pg differ, counting on the usageMetrics table is safer for the MVP data pipeline
        const history = await db.select().from(usageMetrics).orderBy(usageMetrics.date).limit(6);
        res.status(200).json({ success: true, data: history });
    } catch (error) {
        next(error);
    }
}
