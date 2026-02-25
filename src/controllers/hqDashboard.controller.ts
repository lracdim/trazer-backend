import { Request, Response, NextFunction } from "express";
import { db } from "../db/index.js";
import { organizations, users, billing, usageMetrics, incidents } from "../db/schema.js";
import { sql, eq } from "drizzle-orm";

export async function getDashboardOverview(req: Request, res: Response, next: NextFunction) {
    try {
        const [companiesCount] = await db.select({ count: sql<number>`count(*)` }).from(organizations);

        // Active companies: ones with billing status 'active' or 'trialing'
        const [activeCompaniesCount] = await db.select({ count: sql<number>`count(*)` }).from(billing)
            .where(sql`${billing.status} IN ('active', 'trialing')`);

        const [mrrAggregation] = await db.select({ totalMrr: sql<string>`sum(${billing.price})` }).from(billing)
            .where(eq(billing.status, 'active'));

        const [storageRecords] = await db.select({ totalStorage: sql<number>`sum(${usageMetrics.storageUsedGb})` }).from(usageMetrics);

        // Simple new companies (last 30 days)
        const [newCompanies] = await db.select({ count: sql<number>`count(*)` }).from(organizations)
            .where(sql`${organizations.createdAt} >= now() - interval '30 days'`);

        const [incidentVolume] = await db.select({ count: sql<number>`count(*)` }).from(incidents)
            .where(sql`${incidents.createdAt} >= now() - interval '30 days'`);

        res.status(200).json({
            success: true,
            data: {
                totalCompanies: companiesCount.count || 0,
                activeCompanies: activeCompaniesCount.count || 0,
                mrr: mrrAggregation.totalMrr || "0.00",
                arr: ((parseFloat(mrrAggregation.totalMrr) || 0) * 12).toFixed(2),
                storageUsed: storageRecords.totalStorage || 0,
                newCompanies: newCompanies.count || 0,
                incidentVolume: incidentVolume.count || 0
            }
        });
    } catch (error) {
        next(error);
    }
}

export async function getDashboardGrowth(req: Request, res: Response, next: NextFunction) {
    try {
        const history = await db.select().from(usageMetrics).orderBy(usageMetrics.date).limit(30);
        res.status(200).json({ success: true, data: history });
    } catch (error) {
        next(error);
    }
}
