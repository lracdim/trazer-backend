import { Request, Response, NextFunction } from "express";
import { startShift, endShift, getActiveShift, getAllSites, getGuardSchedules } from "../services/shift.service.js";
import { getIO, emitNotification } from "../websocket/index.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

export async function start(req: Request, res: Response, next: NextFunction) {
    try {
        const shift = await startShift(req.user!.userId, req.body);
        const guard = await db.query.users.findFirst({ where: eq(users.id, req.user!.userId) });

        try {
            getIO().to("supervisors").emit("dashboard:refresh");
            emitNotification({
                title: "Shift Started",
                message: `Guard ${guard?.name} started a shift at ${shift.site?.name || 'Unknown Site'}`,
                type: "info"
            });
        } catch (e) { }

        res.status(201).json({ success: true, data: shift });
    } catch (error) {
        next(error);
    }
}

export async function end(req: Request, res: Response, next: NextFunction) {
    try {
        const shift = await endShift(req.user!.userId, req.body.shiftId);
        const guard = await db.query.users.findFirst({ where: eq(users.id, req.user!.userId) });

        try {
            getIO().to("supervisors").emit("dashboard:refresh");
            emitNotification({
                title: "Shift Ended",
                message: `Guard ${guard?.name} ended their shift`,
                type: "info"
            });
        } catch (e) { }

        res.status(200).json({ success: true, data: shift });
    } catch (error) {
        next(error);
    }
}

export async function active(req: Request, res: Response, next: NextFunction) {
    try {
        const shift = await getActiveShift(req.user!.userId);
        res.status(200).json({ success: true, data: shift });
    } catch (error) {
        next(error);
    }
}

export async function listSites(_req: Request, res: Response, next: NextFunction) {
    try {
        const sitesList = await getAllSites();
        res.status(200).json({ success: true, data: sitesList });
    } catch (error) {
        next(error);
    }
}

export async function schedules(req: Request, res: Response, next: NextFunction) {
    try {
        const list = await getGuardSchedules(req.user!.userId);
        res.status(200).json({ success: true, data: list });
    } catch (error) {
        next(error);
    }
}
