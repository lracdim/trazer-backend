import { Request, Response, NextFunction } from "express";
import { createIncident } from "../services/incident.service.js";

export async function report(req: Request, res: Response, next: NextFunction) {
    try {
        // Photo path from Multer (if file was uploaded)
        const photoPath = req.file ? `/uploads/${req.file.filename}` : undefined;

        const incident = await createIncident(req.user!.userId, req.body, photoPath);
        res.status(201).json({ success: true, data: incident });
    } catch (error) {
        next(error);
    }
}
