import { Router } from "express";
import { submitTrialApplication } from "../controllers/public.controller.js";

const router = Router();

// Free Trial Application
router.post("/apply", submitTrialApplication);

export default router;
