import { Router } from "express";
import { getReports, updateReportStatus } from "../controllers/hqReports.controller.js";
import { hqRoleMiddleware } from "../utils/hqAuth.middleware.js";

const router = Router();

router.use(hqRoleMiddleware(["SUPER_ADMIN", "SUPPORT", "TECH"]));

router.get("/", getReports);
router.patch("/:id/status", updateReportStatus);
// router.patch("/:id/assign", ...);

export default router;
