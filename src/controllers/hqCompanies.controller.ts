import { Request, Response, NextFunction } from "express";
import { db } from "../db/index.js";
import { organizations, users, billing, storageUsage } from "../db/schema.js";
import { eq, desc, sql, ilike, and, count, or } from "drizzle-orm";
import { logAdminAction } from "../utils/hqLogger.js";
import { ApiError } from "../utils/apiError.js";

export async function getCompanies(req: Request, res: Response, next: NextFunction) {
    try {
        const { search, status } = req.query;

        // Build base condition
        let conditions = undefined;
        if (search) {
            conditions = or(
                ilike(organizations.name, `%${search}%`),
                ilike(organizations.domain, `%${search}%`)
            );
        }
        if (status) {
            const statusCondition = eq(organizations.status, status as string);
            conditions = conditions ? and(conditions, statusCondition) : statusCondition;
        }

        const orgs = await db
            .select({
                id: organizations.id,
                name: organizations.name,
                domain: organizations.domain,
                status: organizations.status,
                planId: organizations.planId,
                createdAt: organizations.createdAt,
                userCount: sql<number>`count(distinct ${users.id})::int`,
                storageUsedMB: sql<number>`coalesce(sum(${storageUsage.usedMb}), 0)::float`,
                subscriptionStatus: billing.status,
            })
            .from(organizations)
            .leftJoin(billing, eq(organizations.id, billing.organizationId))
            .leftJoin(users, eq(organizations.id, users.organizationId))
            .leftJoin(storageUsage, eq(organizations.id, storageUsage.organizationId))
            .where(conditions)
            .groupBy(organizations.id, billing.status)
            .orderBy(desc(organizations.createdAt));

        res.status(200).json({ success: true, data: orgs });
    } catch (error) {
        next(error);
    }
}

export async function getCompanyDetail(req: Request, res: Response, next: NextFunction) {
    try {
        const id = req.params.id as string;
        const org = await db.query.organizations.findFirst({
            where: eq(organizations.id, id),
            with: {
                billing: { limit: 1 },
                users: {
                    limit: 10,
                    columns: { id: true, name: true, email: true, role: true, createdAt: true }
                },
                adminSettings: { limit: 1 },
            }
        });

        if (!org) throw ApiError.notFound("Company not found");

        res.status(200).json({ success: true, data: org });
    } catch (error) {
        next(error);
    }
}

export async function suspendCompany(req: Request, res: Response, next: NextFunction) {
    try {
        const id = req.params.id as string;
        const org = await db.query.organizations.findFirst({ where: eq(organizations.id, id) });
        if (!org) throw ApiError.notFound("Company not found");

        // Enforce suspension on the organization table directly
        await db.update(organizations).set({ status: 'suspended' }).where(eq(organizations.id, id));

        // Also update billing as a secondary action
        const bill = await db.query.billing.findFirst({ where: eq(billing.organizationId, id) });
        if (bill) {
            await db.update(billing).set({ status: 'suspended' }).where(eq(billing.organizationId, id));
        }

        await logAdminAction({
            adminId: req.admin!.adminId,
            actionType: "company.suspend",
            entityType: "organization",
            entityId: id,
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"]
        });

        res.status(200).json({ success: true, message: "Company suspended successfully" });
    } catch (error) {
        next(error);
    }
}

export async function activateCompany(req: Request, res: Response, next: NextFunction) {
    try {
        const id = req.params.id as string;
        const org = await db.query.organizations.findFirst({ where: eq(organizations.id, id) });
        if (!org) throw ApiError.notFound("Company not found");

        await db.update(organizations).set({ status: 'active' }).where(eq(organizations.id, id));

        const bill = await db.query.billing.findFirst({ where: eq(billing.organizationId, id) });
        if (bill) {
            await db.update(billing).set({ status: 'active' }).where(eq(billing.organizationId, id));
        }

        await logAdminAction({
            adminId: req.admin!.adminId,
            actionType: "company.activate",
            entityType: "organization",
            entityId: id,
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"]
        });

        res.status(200).json({ success: true, message: "Company activated successfully" });
    } catch (error) {
        next(error);
    }
}
