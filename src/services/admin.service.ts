import { eq, desc, and, count, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "../db/index.js";
import {
    users, organizations, billing, adminSettings,
    integrations, apiKeys, webhooks, auditLogs,
    shifts, incidents
} from "../db/schema.js";
import { ApiError } from "../utils/apiError.js";
import { logAudit } from "../middleware/auditLog.js";
import type {
    UpdateProfileInput, ChangePasswordInput, UpdateOrgInput,
    UpdateBillingInput, UpdateSettingsInput, ConnectIntegrationInput,
    GenerateApiKeyInput, CreateWebhookInput, AuditLogsQuery,
} from "../schemas/admin.schema.js";
import fs from "fs/promises";
import path from "path";
import { inArray } from "drizzle-orm";

// ── Plan definitions ──
const PLANS: Record<string, { guardLimit: number; price: string }> = {
    free: { guardLimit: 5, price: "0.00" },
    starter: { guardLimit: 25, price: "49.00" },
    professional: { guardLimit: 100, price: "149.00" },
    enterprise: { guardLimit: 999, price: "499.00" },
};

// ======================================================
// PROFILE
// ======================================================
export async function getProfile(userId: string) {
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        with: { organization: true },
    });
    if (!user) throw ApiError.notFound("User not found");

    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        badgeId: user.badgeId,
        organizationId: user.organizationId,
        organization: user.organization ?? null,
        createdAt: user.createdAt,
    };
}

export async function updateProfile(userId: string, input: UpdateProfileInput, ip?: string) {
    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.phone !== undefined) updateData.phone = input.phone;

    if (Object.keys(updateData).length === 0) {
        throw ApiError.badRequest("Nothing to update");
    }

    const [updated] = await db.update(users).set(updateData).where(eq(users.id, userId)).returning();
    if (!updated) throw ApiError.notFound("User not found");

    await logAudit({ userId, action: "profile.update", entityType: "user", entityId: userId, ipAddress: ip });

    return { id: updated.id, name: updated.name, phone: updated.phone };
}

export async function changePassword(userId: string, input: ChangePasswordInput, ip?: string) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw ApiError.notFound("User not found");

    const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!valid) throw ApiError.unauthorized("Current password is incorrect");

    const newHash = await bcrypt.hash(input.newPassword, 12);
    await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId));

    await logAudit({ userId, action: "profile.password_change", entityType: "user", entityId: userId, ipAddress: ip });

    return { message: "Password changed successfully" };
}

// ======================================================
// ORGANIZATION
// ======================================================
export async function getOrganization(userId: string) {
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        with: { organization: true },
    });
    if (!user) throw ApiError.notFound("User not found");

    if (!user.organization) {
        // Auto-create org for the user with 7-day free trial
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 7);

        const [org] = await db.insert(organizations).values({
            name: "My Organization",
            planId: "free",
            subscriptionStatus: "trialing",
            trialEndsAt: trialEnd
        }).returning();

        await db.update(users).set({ organizationId: org.id }).where(eq(users.id, userId));

        // Create default settings (billing row is technically deprecated now in favor of org fields)
        await db.insert(billing).values({ organizationId: org.id });
        await db.insert(adminSettings).values({ organizationId: org.id });

        return org;
    }

    return user.organization;
}

export async function updateOrganization(userId: string, input: UpdateOrgInput, ip?: string) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user?.organizationId) throw ApiError.badRequest("No organization linked");

    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.businessType !== undefined) updateData.businessType = input.businessType;
    if (input.taxId !== undefined) updateData.taxId = input.taxId;
    if (input.address !== undefined) updateData.address = input.address;
    if (input.timezone !== undefined) updateData.timezone = input.timezone;

    const [updated] = await db.update(organizations).set(updateData)
        .where(eq(organizations.id, user.organizationId)).returning();

    await logAudit({
        userId, organizationId: user.organizationId,
        action: "organization.update", entityType: "organization", entityId: user.organizationId, ipAddress: ip,
    });

    return updated;
}

import { calculateResourceLimits } from "./stripe.service.js";

// ======================================================
// BILLING
// ======================================================
export async function getBilling(userId: string) {
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        with: { organization: true }
    });

    if (!user || !user.organization) throw ApiError.badRequest("No organization linked");

    const org = user.organization;
    const limits = calculateResourceLimits(org);

    const [guardCountResult] = await db.select({ count: count() }).from(users)
        .where(and(eq(users.organizationId, org.id), eq(users.role, "guard")));

    const [adminCountResult] = await db.select({ count: count() }).from(users)
        .where(and(eq(users.organizationId, org.id), eq(users.role, "admin")));

    // Calculate actual storage used by org (incidents photos)
    let storageUsedGB = 0;
    try {
        const orgShifts = await db.select({ id: shifts.id }).from(shifts)
            .innerJoin(users, eq(shifts.guardId, users.id))
            .where(eq(users.organizationId, org.id));

        if (orgShifts.length > 0) {
            const shiftIds = orgShifts.map(s => s.id);
            const orgIncidents = await db.select({ photoPath: incidents.photoPath })
                .from(incidents)
                .where(inArray(incidents.shiftId, shiftIds));

            let totalBytes = 0;
            for (const inc of orgIncidents) {
                if (inc.photoPath) {
                    try {
                        const filename = inc.photoPath.split('/').pop();
                        if (filename) {
                            const fullPath = path.resolve("uploads", filename);
                            const stats = await fs.stat(fullPath);
                            totalBytes += stats.size;
                        }
                    } catch (e) {
                        // Ignore missing files
                    }
                }
            }
            storageUsedGB = totalBytes / (1024 * 1024 * 1024);
        }
    } catch (e) {
        console.error("Storage calculation error:", e);
    }

    return {
        planId: org.planId,
        subscriptionStatus: org.subscriptionStatus,
        trialEndsAt: org.trialEndsAt || new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        promoEndsAt: org.promoEndsAt,
        currentPeriodEnd: org.currentPeriodEnd,
        guards: {
            used: guardCountResult.count,
            limit: limits.maxGuards
        },
        admins: {
            used: adminCountResult.count,
            limit: limits.maxAdmins
        },
        storage: {
            used: storageUsedGB,
            limit: limits.maxStorageGB
        }
    };
}

export async function updateBilling(userId: string, input: UpdateBillingInput, ip?: string) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user?.organizationId) throw ApiError.badRequest("No organization linked");

    const plan = PLANS[input.planName];
    if (!plan) throw ApiError.badRequest("Invalid plan name");

    const nextBillingDate = new Date();
    nextBillingDate.setMonth(nextBillingDate.getMonth() + (input.billingCycle === "yearly" ? 12 : 1));

    const existing = await db.query.billing.findFirst({
        where: eq(billing.organizationId, user.organizationId),
    });

    let result;
    if (existing) {
        const [updated] = await db.update(billing).set({
            planName: input.planName,
            guardLimit: plan.guardLimit,
            billingCycle: input.billingCycle || existing.billingCycle,
            price: plan.price,
            nextBillingDate,
        }).where(eq(billing.id, existing.id)).returning();
        result = updated;
    } else {
        const [created] = await db.insert(billing).values({
            organizationId: user.organizationId,
            planName: input.planName,
            guardLimit: plan.guardLimit,
            billingCycle: input.billingCycle || "monthly",
            price: plan.price,
            nextBillingDate,
        }).returning();
        result = created;
    }

    await logAudit({
        userId, organizationId: user.organizationId,
        action: "billing.plan_change", entityType: "billing", entityId: result.id,
        ipAddress: ip,
    });

    return result;
}

// ======================================================
// SETTINGS
// ======================================================
export async function getSettings(userId: string) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user?.organizationId) throw ApiError.badRequest("No organization linked");

    const existing = await db.query.adminSettings.findFirst({
        where: eq(adminSettings.organizationId, user.organizationId),
    });
    if (!existing) {
        const [created] = await db.insert(adminSettings).values({ organizationId: user.organizationId }).returning();
        return created;
    }
    return existing;
}

export async function updateSettings(userId: string, input: UpdateSettingsInput, ip?: string) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user?.organizationId) throw ApiError.badRequest("No organization linked");

    const existing = await db.query.adminSettings.findFirst({
        where: eq(adminSettings.organizationId, user.organizationId),
    });

    let result;
    if (existing) {
        const [updated] = await db.update(adminSettings).set(input)
            .where(eq(adminSettings.id, existing.id)).returning();
        result = updated;
    } else {
        const [created] = await db.insert(adminSettings).values({
            organizationId: user.organizationId, ...input,
        }).returning();
        result = created;
    }

    await logAudit({
        userId, organizationId: user.organizationId,
        action: "settings.update", entityType: "admin_settings", entityId: result.id, ipAddress: ip,
    });

    return result;
}

// ======================================================
// INTEGRATIONS
// ======================================================
export async function getIntegrations(userId: string) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user?.organizationId) throw ApiError.badRequest("No organization linked");

    return db.query.integrations.findMany({
        where: eq(integrations.organizationId, user.organizationId),
        orderBy: [desc(integrations.createdAt)],
    });
}

export async function connectIntegration(userId: string, input: ConnectIntegrationInput, ip?: string) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user?.organizationId) throw ApiError.badRequest("No organization linked");

    const [created] = await db.insert(integrations).values({
        organizationId: user.organizationId,
        name: input.name,
        status: "connected",
        configJson: input.configJson || null,
    }).returning();

    await logAudit({
        userId, organizationId: user.organizationId,
        action: "integration.connect", entityType: "integration", entityId: created.id, ipAddress: ip,
    });

    return created;
}

export async function disconnectIntegration(userId: string, integrationId: string, ip?: string) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user?.organizationId) throw ApiError.badRequest("No organization linked");

    const existing = await db.query.integrations.findFirst({
        where: and(eq(integrations.id, integrationId), eq(integrations.organizationId, user.organizationId)),
    });
    if (!existing) throw ApiError.notFound("Integration not found");

    await db.delete(integrations).where(eq(integrations.id, integrationId));

    await logAudit({
        userId, organizationId: user.organizationId,
        action: "integration.disconnect", entityType: "integration", entityId: integrationId, ipAddress: ip,
    });

    return { message: "Integration disconnected" };
}

// ======================================================
// API KEYS
// ======================================================
export async function listApiKeys(userId: string) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user?.organizationId) throw ApiError.badRequest("No organization linked");

    const keys = await db.query.apiKeys.findMany({
        where: eq(apiKeys.organizationId, user.organizationId),
        orderBy: [desc(apiKeys.createdAt)],
    });

    return keys.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyHash.substring(0, 8) + "...",
        createdAt: k.createdAt,
        revokedAt: k.revokedAt,
        isActive: !k.revokedAt,
    }));
}

export async function generateApiKey(userId: string, input: GenerateApiKeyInput, ip?: string) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user?.organizationId) throw ApiError.badRequest("No organization linked");

    // Generate a random API key
    const rawKey = `trz_${crypto.randomBytes(32).toString("hex")}`;
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const [created] = await db.insert(apiKeys).values({
        organizationId: user.organizationId,
        name: input.name,
        keyHash,
    }).returning();

    await logAudit({
        userId, organizationId: user.organizationId,
        action: "api_key.generate", entityType: "api_key", entityId: created.id, ipAddress: ip,
    });

    // Return the raw key ONLY on creation — it can never be retrieved again
    return { id: created.id, name: created.name, key: rawKey, createdAt: created.createdAt };
}

export async function revokeApiKey(userId: string, keyId: string, ip?: string) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user?.organizationId) throw ApiError.badRequest("No organization linked");

    const existing = await db.query.apiKeys.findFirst({
        where: and(eq(apiKeys.id, keyId), eq(apiKeys.organizationId, user.organizationId)),
    });
    if (!existing) throw ApiError.notFound("API key not found");
    if (existing.revokedAt) throw ApiError.badRequest("API key already revoked");

    await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, keyId));

    await logAudit({
        userId, organizationId: user.organizationId,
        action: "api_key.revoke", entityType: "api_key", entityId: keyId, ipAddress: ip,
    });

    return { message: "API key revoked" };
}

// ======================================================
// WEBHOOKS
// ======================================================
export async function listWebhooks(userId: string) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user?.organizationId) throw ApiError.badRequest("No organization linked");

    return db.query.webhooks.findMany({
        where: eq(webhooks.organizationId, user.organizationId),
        orderBy: [desc(webhooks.createdAt)],
    });
}

export async function createWebhook(userId: string, input: CreateWebhookInput, ip?: string) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user?.organizationId) throw ApiError.badRequest("No organization linked");

    const [created] = await db.insert(webhooks).values({
        organizationId: user.organizationId,
        url: input.url,
        eventType: input.eventType,
    }).returning();

    await logAudit({
        userId, organizationId: user.organizationId,
        action: "webhook.create", entityType: "webhook", entityId: created.id, ipAddress: ip,
    });

    return created;
}

export async function deleteWebhook(userId: string, webhookId: string, ip?: string) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user?.organizationId) throw ApiError.badRequest("No organization linked");

    const existing = await db.query.webhooks.findFirst({
        where: and(eq(webhooks.id, webhookId), eq(webhooks.organizationId, user.organizationId)),
    });
    if (!existing) throw ApiError.notFound("Webhook not found");

    await db.delete(webhooks).where(eq(webhooks.id, webhookId));

    await logAudit({
        userId, organizationId: user.organizationId,
        action: "webhook.delete", entityType: "webhook", entityId: webhookId, ipAddress: ip,
    });

    return { message: "Webhook deleted" };
}

// ======================================================
// AUDIT LOGS
// ======================================================
export async function getAuditLogs(userId: string, query: AuditLogsQuery) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user?.organizationId) throw ApiError.badRequest("No organization linked");

    const { page, limit, action } = query;
    const offset = (page - 1) * limit;

    const conditions = [eq(auditLogs.organizationId, user.organizationId)];
    if (action) conditions.push(eq(auditLogs.action, action));

    const [totalResult] = await db.select({ count: count() }).from(auditLogs)
        .where(and(...conditions));

    const logs = await db.query.auditLogs.findMany({
        where: and(...conditions),
        orderBy: [desc(auditLogs.createdAt)],
        limit,
        offset,
        with: { user: true },
    });

    return {
        data: logs.map((l) => ({
            id: l.id,
            action: l.action,
            entityType: l.entityType,
            entityId: l.entityId,
            ipAddress: l.ipAddress,
            userName: l.user?.name ?? "System",
            createdAt: l.createdAt,
        })),
        pagination: {
            page,
            limit,
            total: totalResult.count,
            totalPages: Math.ceil(totalResult.count / limit),
        },
    };
}
