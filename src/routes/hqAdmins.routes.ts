import { Router } from "express";
import { getAdmins, createAdmin, deactivateAdmin } from "../controllers/hqAdmins.controller.js";

const router = Router();

router.get("/", getAdmins);
router.post("/", createAdmin);
router.patch("/:id/deactivate", deactivateAdmin);

export default router;
