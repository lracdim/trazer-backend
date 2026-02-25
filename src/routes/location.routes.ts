import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireRole, requireMinRole } from "../middleware/role.js";
import { recordLocations, getShiftRoute, getActiveGuardLocations } from "../services/location.service.js";
import { emitAlert, emitGuardLocation } from "../websocket/index.js";
import { Request, Response, NextFunction } from "express";

const router = Router();

/**
 * POST /locations — Guard sends batch GPS locations
 * Body: { shiftId, locations: [{ latitude, longitude, accuracy?, speed?, heading?, recordedAt? }] }
 */
router.post(
    "/",
    authenticate,
    requireRole("guard"),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { shiftId, locations } = req.body;

            if (!shiftId || !Array.isArray(locations) || locations.length === 0) {
                res.status(400).json({ success: false, message: "shiftId and locations array required" });
                return;
            }

            const result = await recordLocations(req.user!.userId, shiftId, locations);

            // Emit latest position to supervisors via WebSocket
            const latest = locations[locations.length - 1];
            emitGuardLocation({
                guardId: req.user!.userId,
                shiftId,
                lat: latest.latitude,
                lng: latest.longitude,
                accuracy: latest.accuracy,
                speed: latest.speed,
                recordedAt: latest.recordedAt || new Date().toISOString(),
            });

            // Emit any generated alerts
            for (const alert of result.alerts) {
                emitAlert(alert);
            }

            res.status(200).json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * GET /locations/active — Get all active guard positions (for live map)
 */
router.get(
    "/active",
    authenticate,
    requireMinRole("supervisor"),
    async (_req: Request, res: Response, next: NextFunction) => {
        try {
            const data = await getActiveGuardLocations();
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * GET /locations/route/:shiftId — Get route for a shift (playback)
 */
router.get(
    "/route/:shiftId",
    authenticate,
    requireMinRole("supervisor"),
    async (req: Request<{ shiftId: string }>, res: Response, next: NextFunction) => {
        try {
            const data = await getShiftRoute(req.params.shiftId);
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    }
);

export default router;
