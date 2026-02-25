import { Router } from "express";
import { getMrr, getPlanDistribution, getOverdueAccounts, getRevenueTrend } from "../controllers/hqFinance.controller.js";
import { hqRoleMiddleware } from "../utils/hqAuth.middleware.js";

const router = Router();

// Only SUPER_ADMIN and FINANCE roles can access these details
router.use(hqRoleMiddleware(["SUPER_ADMIN", "FINANCE"]));

router.get("/mrr", getMrr);
router.get("/plan-distribution", getPlanDistribution);
router.get("/overdue", getOverdueAccounts);
router.get("/revenue-trend", getRevenueTrend);

export default router;
