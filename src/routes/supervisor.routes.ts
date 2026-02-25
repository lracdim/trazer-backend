import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireMinRole } from "../middleware/role.js";
import {
    activeShifts,
    shiftDetail,
    shiftReport,
    guards,
    guardProfile,
    addGuard,
    removeGuard,
    supervisorSites,
    addSite,
    removeSite,
    listSchedules,
    addSchedule,
    removeSchedule,
    listIncidents,
} from "../controllers/supervisor.controller.js";

const router = Router();

// All supervisor routes require auth + at least supervisor role
router.use(authenticate, requireMinRole("supervisor"));

// Shifts
router.get("/shifts/active", activeShifts);
router.get("/shifts/:id", shiftDetail);
router.get("/shifts/:id/report", shiftReport);

// Guards
router.get("/guards", guards);
router.get("/guards/:id", guardProfile);
router.post("/guards", addGuard);
router.delete("/guards/:id", removeGuard);

// Sites
router.get("/sites", supervisorSites);
router.post("/sites", addSite);
router.delete("/sites/:id", removeSite);

// Schedules
router.get("/schedules", listSchedules);
router.post("/schedules", addSchedule);
router.delete("/schedules/:id", removeSchedule);

// Incidents
router.get("/incidents", listIncidents);

export default router;
