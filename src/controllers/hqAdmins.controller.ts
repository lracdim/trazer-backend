import { Request, Response, NextFunction } from "express";
import { db } from "../db/index.js";
import { platformAdmins } from "../db/schema.js";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { ApiError } from "../utils/apiError.js";
import { logAdminAction } from "../utils/hqLogger.js";
import { HqAuthPayload } from "../utils/hqAuth.middleware.js";

export async function getAdmins(req: Request, res: Response, next: NextFunction) {
    try {
        const admins = await db.query.platformAdmins.findMany({
            columns: {
                id: true,
                email: true,
                role: true,
                isActive: true,
                failedAttempts: true,
                lastLoginAt: true,
                createdAt: true,
                updatedAt: true,
            }
        });
        res.status(200).json({ success: true, data: admins });
    } catch (error) {
        next(error);
    }
}

export async function createAdmin(req: Request, res: Response, next: NextFunction) {
    try {
        const { email, password, role } = req.body;

        const existing = await db.query.platformAdmins.findFirst({ where: eq(platformAdmins.email, email) });
        if (existing) throw ApiError.badRequest("Admin with this email already exists");

        const passwordHash = await bcrypt.hash(password, 10);

        const [newAdmin] = await db.insert(platformAdmins).values({
            email,
            passwordHash,
            role,
        }).returning();

        await logAdminAction({
            adminId: req.admin!.adminId,
            actionType: "admin.create",
            entityType: "platform_admins",
            entityId: newAdmin.id,
            metadata: { email, role },
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"]
        });

        res.status(201).json({ success: true, message: "Admin created successfully" });
    } catch (error) {
        next(error);
    }
}

export async function deactivateAdmin(req: Request, res: Response, next: NextFunction) {
    try {
        const { id } = req.params;
        const adminIdToDeactivate = id as string;

        if (adminIdToDeactivate === req.admin!.adminId) {
            throw ApiError.badRequest("Cannot deactivate your own account");
        }

        const admin = await db.query.platformAdmins.findFirst({ where: eq(platformAdmins.id, adminIdToDeactivate) });
        if (!admin) throw ApiError.notFound("Admin not found");

        await db.update(platformAdmins).set({ isActive: false, updatedAt: new Date() }).where(eq(platformAdmins.id, adminIdToDeactivate));

        await logAdminAction({
            adminId: req.admin!.adminId,
            actionType: "admin.deactivate",
            entityType: "platform_admins",
            entityId: id as string,
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"]
        });

        res.status(200).json({ success: true, message: "Admin deactivated successfully" });
    } catch (error) {
        next(error);
    }
}
