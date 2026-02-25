import { Request, Response, NextFunction } from "express";
import { db } from "../db/index.js";
import { clientReports } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { ApiError } from "../utils/apiError.js";
import { logAdminAction } from "../utils/hqLogger.js";
import { HqAuthPayload } from "../utils/hqAuth.middleware.js";

export async function getReports(req: Request, res: Response, next: NextFunction) {
    try {
        const reports = await db.query.clientReports.findMany({
            with: { company: true, reportedByUser: true }
        });

        res.status(200).json({ success: true, data: reports });
    } catch (error) {
        next(error);
    }
}

export async function updateReportStatus(req: Request, res: Response, next: NextFunction) {
    try {
        const id = req.params.id as string;
        const { status, adminNotes } = req.body;

        const report = await db.query.clientReports.findFirst({ where: eq(clientReports.id, id) });
        if (!report) throw ApiError.notFound("Report not found");

        await db.update(clientReports)
            .set({
                status,
                adminNotes: adminNotes ?? report.adminNotes,
                updatedAt: new Date()
            })
            .where(eq(clientReports.id, id));

        await logAdminAction({
            adminId: req.admin!.adminId,
            actionType: "report.update_status",
            entityType: "report",
            entityId: id as string,
            metadata: { newStatus: status },
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"]
        });

        res.status(200).json({ success: true, message: "Report status updated" });
    } catch (error) {
        next(error);
    }
}
