import { Router } from "express";
import { register, login, refresh, validateSession } from "../controllers/auth.controller.js";
import { validate } from "../middleware/validate.js";
import { registerSchema, loginSchema, refreshSchema } from "../schemas/auth.schema.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/refresh", validate(refreshSchema), refresh);
router.get("/session/validate", authenticate, validateSession);

export default router;
