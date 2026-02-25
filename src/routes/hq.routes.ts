import { Router } from "express";
import { hqAuthMiddleware, require2FA, hqRoleMiddleware } from "../utils/hqAuth.middleware.js";

import authRoutes from "./hqAuth.routes.js";
import dashboardRoutes from "./hqDashboard.routes.js";
import companiesRoutes from "./hqCompanies.routes.js";
import financeRoutes from "./hqFinance.routes.js";
import infraRoutes from "./hqInfra.routes.js";
import reportsRoutes from "./hqReports.routes.js";
import adminsRoutes from "./hqAdmins.routes.js";
import auditRoutes from "./hqAudit.routes.js";

const router = Router();

// Auth routes (handles its own middleware via the router)
router.use("/auth", authRoutes);

// Apply strict Global HQ Protection to all subsequent routes
router.use(hqAuthMiddleware, require2FA);

// Mount protected feature routes
router.use("/dashboard", dashboardRoutes);
router.use("/companies", companiesRoutes);
router.use("/finance", financeRoutes);
router.use("/infrastructure", infraRoutes);
router.use("/reports", reportsRoutes);
router.use("/admins", hqRoleMiddleware(["SUPER_ADMIN"]), adminsRoutes);
router.use("/audit", hqRoleMiddleware(["SUPER_ADMIN"]), auditRoutes);

export default router;
