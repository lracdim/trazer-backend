import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireMinRole } from "../middleware/role.js";
import * as admin from "../controllers/admin.controller.js";

import { requireActiveSubscription } from "../middleware/subscription.js";

const router = Router();

// Auth + Role check
router.use(authenticate, requireMinRole("admin"));

// Profile
router.get("/profile", admin.getProfile);
router.put("/profile", admin.updateProfile);
router.put("/profile/password", admin.changePassword);

// Billing (Bypasses active subscription check)
router.get("/billing", admin.getBilling);
router.put("/billing", admin.updateBilling);
router.post("/billing/checkout", admin.createCheckoutSession);

// Apply Active Subscription check to everything else below this point
router.use(requireActiveSubscription);

// Organization
router.get("/organization", admin.getOrganization);
router.put("/organization", admin.updateOrganization);

// Integrations
router.get("/integrations", admin.getIntegrations);
router.post("/integrations", admin.connectIntegration);
router.delete("/integrations/:id", admin.disconnectIntegration);

// API Keys
router.get("/api-keys", admin.listApiKeys);
router.post("/api-keys", admin.generateApiKey);
router.delete("/api-keys/:id", admin.revokeApiKey);

// Webhooks
router.get("/webhooks", admin.listWebhooks);
router.post("/webhooks", admin.createWebhook);
router.delete("/webhooks/:id", admin.deleteWebhook);

// Audit Logs
router.get("/audit-logs", admin.getAuditLogs);

export default router;
