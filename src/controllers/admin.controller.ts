import { Request, Response, NextFunction } from "express";
import * as adminService from "../services/admin.service.js";
import {
    updateProfileSchema, changePasswordSchema, updateOrgSchema,
    updateBillingSchema, updateSettingsSchema, connectIntegrationSchema,
    generateApiKeySchema, createWebhookSchema, auditLogsQuerySchema,
} from "../schemas/admin.schema.js";

const getIp = (req: Request) => (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "";

// ── Profile ──
export async function getProfile(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await adminService.getProfile(req.user!.userId) }); }
    catch (e) { next(e); }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
        const { body } = updateProfileSchema.parse(req);
        res.json({ success: true, data: await adminService.updateProfile(req.user!.userId, body, getIp(req)) });
    } catch (e) { next(e); }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
    try {
        const { body } = changePasswordSchema.parse(req);
        res.json({ success: true, data: await adminService.changePassword(req.user!.userId, body, getIp(req)) });
    } catch (e) { next(e); }
}

// ── Organization ──
export async function getOrganization(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await adminService.getOrganization(req.user!.userId) }); }
    catch (e) { next(e); }
}

export async function updateOrganization(req: Request, res: Response, next: NextFunction) {
    try {
        const { body } = updateOrgSchema.parse(req);
        res.json({ success: true, data: await adminService.updateOrganization(req.user!.userId, body, getIp(req)) });
    } catch (e) { next(e); }
}

// ── Billing ──
export async function getBilling(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await adminService.getBilling(req.user!.userId) }); }
    catch (e) { next(e); }
}

export async function updateBilling(req: Request, res: Response, next: NextFunction) {
    try {
        const { body } = updateBillingSchema.parse(req);
        res.json({ success: true, data: await adminService.updateBilling(req.user!.userId, body, getIp(req)) });
    } catch (e) { next(e); }
}

import { createCheckoutSession as stripeCreateCheckout } from "../services/stripe.service.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

export async function createCheckoutSession(req: Request, res: Response, next: NextFunction) {
    try {
        const { returnUrl } = req.body;
        const user = await db.query.users.findFirst({ where: eq(users.id, req.user!.userId) });
        const orgId = user?.organizationId;
        if (!orgId) throw new Error("User does not belong to an organization");
        const session = await stripeCreateCheckout(orgId, returnUrl);
        res.json({ success: true, data: session });
    } catch (e) { next(e); }
}

// ── Settings ──
export async function getSettings(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await adminService.getSettings(req.user!.userId) }); }
    catch (e) { next(e); }
}

export async function updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
        const { body } = updateSettingsSchema.parse(req);
        res.json({ success: true, data: await adminService.updateSettings(req.user!.userId, body, getIp(req)) });
    } catch (e) { next(e); }
}

// ── Integrations ──
export async function getIntegrations(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await adminService.getIntegrations(req.user!.userId) }); }
    catch (e) { next(e); }
}

export async function connectIntegration(req: Request, res: Response, next: NextFunction) {
    try {
        const { body } = connectIntegrationSchema.parse(req);
        res.json({ success: true, data: await adminService.connectIntegration(req.user!.userId, body, getIp(req)) });
    } catch (e) { next(e); }
}

export async function disconnectIntegration(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await adminService.disconnectIntegration(req.user!.userId, req.params.id, getIp(req)) }); }
    catch (e) { next(e); }
}

// ── API Keys ──
export async function listApiKeys(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await adminService.listApiKeys(req.user!.userId) }); }
    catch (e) { next(e); }
}

export async function generateApiKey(req: Request, res: Response, next: NextFunction) {
    try {
        const { body } = generateApiKeySchema.parse(req);
        res.status(201).json({ success: true, data: await adminService.generateApiKey(req.user!.userId, body, getIp(req)) });
    } catch (e) { next(e); }
}

export async function revokeApiKey(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await adminService.revokeApiKey(req.user!.userId, req.params.id, getIp(req)) }); }
    catch (e) { next(e); }
}

// ── Webhooks ──
export async function listWebhooks(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await adminService.listWebhooks(req.user!.userId) }); }
    catch (e) { next(e); }
}

export async function createWebhook(req: Request, res: Response, next: NextFunction) {
    try {
        const { body } = createWebhookSchema.parse(req);
        res.status(201).json({ success: true, data: await adminService.createWebhook(req.user!.userId, body, getIp(req)) });
    } catch (e) { next(e); }
}

export async function deleteWebhook(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await adminService.deleteWebhook(req.user!.userId, req.params.id, getIp(req)) }); }
    catch (e) { next(e); }
}

// ── Audit Logs ──
export async function getAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
        const { query } = auditLogsQuerySchema.parse(req);
        res.json({ success: true, data: await adminService.getAuditLogs(req.user!.userId, query) });
    } catch (e) { next(e); }
}
