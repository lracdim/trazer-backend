import { Router } from "express";
import { start, end, active, listSites, schedules } from "../controllers/shift.controller.js";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { validate } from "../middleware/validate.js";
import { startShiftSchema, endShiftSchema } from "../schemas/shift.schema.js";

const router = Router();

// All shift routes require auth + guard role
router.use(authenticate, requireRole("guard"));

router.get("/sites", listSites);
router.post("/start", validate(startShiftSchema), start);
router.post("/end", validate(endShiftSchema), end);
router.get("/active", active);
router.get("/schedules", schedules);

export default router;

