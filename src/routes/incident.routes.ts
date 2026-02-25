import { Router } from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { report } from "../controllers/incident.controller.js";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { validate } from "../middleware/validate.js";
import { incidentSchema } from "../schemas/incident.schema.js";

const router = Router();

// Configure Multer for incident photo uploads
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, path.resolve("uploads"));
    },
    filename: (_req, file, cb) => {
        // Generate UUID filename to prevent directory traversal
        const ext = path.extname(file.originalname).toLowerCase();
        const name = crypto.randomUUID();
        cb(null, `${name}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
    },
    fileFilter: (_req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/webp"];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only JPEG, PNG, and WebP images are allowed"));
        }
    },
});

router.use(authenticate, requireRole("guard"));

// Multer runs BEFORE body validation because it's multipart/form-data
router.post("/", upload.single("photo"), validate(incidentSchema), report);

export default router;
