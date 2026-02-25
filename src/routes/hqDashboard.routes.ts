import { Router } from "express";
import { getDashboardOverview, getDashboardGrowth } from "../controllers/hqDashboard.controller.js";

const router = Router();

router.get("/overview", getDashboardOverview);
router.get("/growth", getDashboardGrowth);

export default router;
