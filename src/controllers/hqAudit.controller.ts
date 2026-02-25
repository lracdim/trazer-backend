import { Request, Response, NextFunction } from "express";
import { db } from "../db/index.js";
import { adminActivityLogs } from "../db/schema.js";
import { desc } from "drizzle-orm";

export async function getAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
        const logs = await db.query.adminActivityLogs.findMany({
            with: { admin: { columns: { email: true, role: true } } },
            orderBy: [desc(adminActivityLogs.createdAt)],
            limit: 500, // Safe limit for dashboard usage
        });

        res.status(200).json({ success: true, data: logs });
    } catch (error) {
        next(error);
    }
}
