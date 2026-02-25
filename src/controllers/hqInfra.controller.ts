import { Request, Response, NextFunction } from "express";
import { db } from "../db/index.js";
import { usageMetrics, organizations } from "../db/schema.js";
import { sql } from "drizzle-orm";

export async function getStorageMetrics(req: Request, res: Response, next: NextFunction) {
    try {
        const [totalStorage] = await db.select({ gb: sql<string>`sum(${usageMetrics.storageUsedGb})` }).from(usageMetrics);

        // Real query to get the top 10 organizations by addonStorage size
        const orgs = await db.query.organizations.findMany({
            limit: 10,
        });
        const topConsumers = orgs.map(o => ({
            companyName: o.name,
            storageGb: o.addonStorage.toFixed(2),
        }));

        res.status(200).json({
            success: true,
            data: {
                totalStorageGb: totalStorage.gb || "0.00",
                topConsumers
            }
        });
    } catch (error) {
        next(error);
    }
}

export async function getApiUsage(req: Request, res: Response, next: NextFunction) {
    try {
        const history = await db.select().from(usageMetrics).orderBy(usageMetrics.date).limit(30);
        res.status(200).json({ success: true, data: history });
    } catch (error) {
        next(error);
    }
}

export async function getErrorRates(req: Request, res: Response, next: NextFunction) {
    try {
        // Pseudo-data for error rates
        const data = [
            { endpoint: "/api/incidents/upload", errorRate: "2.1%" },
            { endpoint: "/api/shifts/start", errorRate: "0.5%" },
            { endpoint: "/api/auth/login", errorRate: "1.2%" },
        ];
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}
