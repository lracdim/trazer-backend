import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireMinRole } from "../middleware/role.js";
import { getAlerts, resolveAlert, getUnresolvedAlertCount } from "../services/alert.service.js";
import { Request, Response, NextFunction } from "express";

const router = Router();

// All alert routes require auth + supervisor role
router.use(authenticate, requireMinRole("supervisor"));

/**
 * GET /alerts — List alerts with optional filters
 * Query: ?type=out_of_bounds&resolved=false
 */
router.get(
    "/",
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const type = req.query.type as string | undefined;
            const resolvedStr = req.query.resolved as string | undefined;
            const resolved = resolvedStr === "true" ? true : resolvedStr === "false" ? false : undefined;

            const data = await getAlerts({ type, resolved });
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * GET /alerts/count — Get unresolved alert count
 */
router.get(
    "/count",
    async (_req: Request, res: Response, next: NextFunction) => {
        try {
            const count = await getUnresolvedAlertCount();
            res.status(200).json({ success: true, data: { count } });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * PATCH /alerts/:id/resolve — Resolve an alert
 */
router.patch(
    "/:id/resolve",
    async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const alert = await resolveAlert(req.params.id);
            if (!alert) {
                res.status(404).json({ success: false, message: "Alert not found" });
                return;
            }
            res.status(200).json({ success: true, data: alert });
        } catch (error) {
            next(error);
        }
    }
);

export default router;
