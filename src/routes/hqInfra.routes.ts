import { Router } from "express";
import { getStorageMetrics, getApiUsage, getErrorRates } from "../controllers/hqInfra.controller.js";
import { hqRoleMiddleware } from "../utils/hqAuth.middleware.js";

const router = Router();

// Only SUPER_ADMIN and TECH can see infrastructure data
router.use(hqRoleMiddleware(["SUPER_ADMIN", "TECH"]));

router.get("/storage", getStorageMetrics);
router.get("/api-usage", getApiUsage);
router.get("/error-rate", getErrorRates);

export default router;
