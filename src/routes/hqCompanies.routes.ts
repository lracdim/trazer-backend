import { Router } from "express";
import { getCompanies, getCompanyDetail, suspendCompany, activateCompany } from "../controllers/hqCompanies.controller.js";
import { hqRoleMiddleware } from "../utils/hqAuth.middleware.js";

const router = Router();

router.get("/", getCompanies);
router.get("/:id", getCompanyDetail);

// Only Super Admins and Support might suspend/activate? The instructions denote TECH/SUPPORT read-only for companies mostly, 
// SUPER_ADMIN has full access. Let's allow SUPER_ADMIN for suspension operations.
router.patch("/:id/suspend", hqRoleMiddleware(["SUPER_ADMIN"]), suspendCompany);
router.patch("/:id/activate", hqRoleMiddleware(["SUPER_ADMIN"]), activateCompany);

export default router;
