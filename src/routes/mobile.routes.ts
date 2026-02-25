import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { getGuardDashboard, triggerPanic, getActivePatrol, completeCheckpoint, getIncidentTypes, getMyReports, submitReport, getGuardProfile, getGuardSchedule } from "../controllers/mobile.controller.js";
import multer from "multer";
import path from "path";
import crypto from "crypto";

const router = Router();

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, path.resolve("uploads"));
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const name = crypto.randomUUID();
        cb(null, `${name}${ext}`);
    },
});
const upload = multer({ storage });

// Secure mobile routes
router.use(authenticate, requireRole("guard"));

router.get("/guard/dashboard", getGuardDashboard);
router.get("/guard/profile", getGuardProfile);
router.get("/guard/schedule", getGuardSchedule);
router.post("/panic/trigger", triggerPanic);
router.get("/patrol/active", getActivePatrol);
router.post("/patrol/checkpoint/:id/complete", completeCheckpoint);

// Reports
router.get("/incident-types", getIncidentTypes);
router.get("/reports", getMyReports);
router.post("/reports", submitReport);
router.post("/reports/upload-evidence", upload.single("photo"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: "No photo uploaded" });
    }
    res.status(200).json({ success: true, url: `/uploads/${req.file.filename}` });
});

export default router;
