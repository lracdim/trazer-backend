import { z } from "zod";

// ── Profile ──
export const updateProfileSchema = z.object({
    body: z.object({
        name: z.string().min(1).max(255).optional(),
        phone: z.string().max(50).optional(),
    }),
});

export const changePasswordSchema = z.object({
    body: z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8).max(128),
    }),
});

// ── Organization ──
export const updateOrgSchema = z.object({
    body: z.object({
        name: z.string().min(1).max(255).optional(),
        businessType: z.string().max(100).optional(),
        taxId: z.string().max(100).optional(),
        address: z.string().max(1000).optional(),
        timezone: z.string().max(100).optional(),
    }),
});

// ── Billing ──
export const updateBillingSchema = z.object({
    body: z.object({
        planName: z.enum(["free", "starter", "professional", "enterprise"]),
        billingCycle: z.enum(["monthly", "yearly"]).optional(),
    }),
});

// ── Settings ──
export const updateSettingsSchema = z.object({
    body: z.object({
        requireGps: z.boolean().optional(),
        requirePhotoIncident: z.boolean().optional(),
        allowOfflineCheckin: z.boolean().optional(),
        sessionTimeoutMinutes: z.number().int().min(5).max(480).optional(),
        darkModeEnabled: z.boolean().optional(),
    }),
});

// ── Integrations ──
export const connectIntegrationSchema = z.object({
    body: z.object({
        name: z.string().min(1).max(255),
        configJson: z.record(z.unknown()).optional(),
    }),
});

// ── API Keys ──
export const generateApiKeySchema = z.object({
    body: z.object({
        name: z.string().min(1).max(255),
    }),
});

// ── Webhooks ──
export const createWebhookSchema = z.object({
    body: z.object({
        url: z.string().url().max(500),
        eventType: z.string().min(1).max(100),
    }),
});

// ── Audit Logs Query ──
export const auditLogsQuerySchema = z.object({
    query: z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        action: z.string().optional(),
    }),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>["body"];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>["body"];
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>["body"];
export type UpdateBillingInput = z.infer<typeof updateBillingSchema>["body"];
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>["body"];
export type ConnectIntegrationInput = z.infer<typeof connectIntegrationSchema>["body"];
export type GenerateApiKeyInput = z.infer<typeof generateApiKeySchema>["body"];
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>["body"];
export type AuditLogsQuery = z.infer<typeof auditLogsQuerySchema>["query"];
