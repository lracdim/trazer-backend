import { Router } from "express";
import { login, setup2FA, verifyTwoFactor, logout, me } from "../controllers/hqAuth.controller.js";
import { hqAuthMiddleware, require2FA } from "../utils/hqAuth.middleware.js";

const router = Router();

// Public login
router.post("/login", login);

// Requires partial auth (JWT without 2FA verified yet)
router.post("/2fa/setup", hqAuthMiddleware, setup2FA);
router.post("/2fa/verify", hqAuthMiddleware, verifyTwoFactor);

// Requires full auth
router.post("/logout", hqAuthMiddleware, logout);
router.get("/me", hqAuthMiddleware, require2FA, me);

export default router;
