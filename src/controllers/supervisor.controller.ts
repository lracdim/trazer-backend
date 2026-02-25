import { Request, Response, NextFunction } from "express";
import {
    getActiveShifts,
    getShiftDetail,
    getAllGuards,
    getAllSitesWithDetails,
    getGuardProfile,
    createGuard,
    deleteGuard,
    createSite,
    deleteSite,
    generateShiftReport,
    getAllSchedules,
    createSchedule,
    deleteSchedule,
    getAllIncidents,
} from "../services/supervisor.service.js";

export async function activeShifts(_req: Request, res: Response, next: NextFunction) {
    try {
        const data = await getActiveShifts();
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

export async function shiftDetail(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
        const data = await getShiftDetail(req.params.id);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

export async function shiftReport(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
        const report = await generateShiftReport(req.params.id);
        res.status(200).json({ success: true, data: report });
    } catch (error) {
        next(error);
    }
}

export async function listIncidents(_req: Request, res: Response, next: NextFunction) {
    try {
        const data = await getAllIncidents();
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

export async function guards(_req: Request, res: Response, next: NextFunction) {
    try {
        const data = await getAllGuards();
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

export async function guardProfile(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
        const data = await getGuardProfile(req.params.id);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

export async function addGuard(req: Request, res: Response, next: NextFunction) {
    try {
        const user = await db.query.users.findFirst({ where: eq(users.id, req.user!.userId) });
        const orgId = user?.organizationId;
        if (!orgId) throw new Error("No organization found");

        const data = await createGuard({ ...req.body, organizationId: orgId });
        res.status(201).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

export async function removeGuard(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
        await deleteGuard(req.params.id);
        res.status(200).json({ success: true, message: "Guard deleted" });
    } catch (error) {
        next(error);
    }
}

export async function supervisorSites(_req: Request, res: Response, next: NextFunction) {
    try {
        const data = await getAllSitesWithDetails();
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

export async function addSite(req: Request, res: Response, next: NextFunction) {
    try {
        const data = await createSite(req.body);
        res.status(201).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

export async function removeSite(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
        await deleteSite(req.params.id);
        res.status(200).json({ success: true, message: "Site deleted" });
    } catch (error) {
        next(error);
    }
}

// Schedules
export async function listSchedules(_req: Request, res: Response, next: NextFunction) {
    try {
        const data = await getAllSchedules();
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

export async function addSchedule(req: Request, res: Response, next: NextFunction) {
    try {
        const data = await createSchedule(req.body);
        res.status(201).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

export async function removeSchedule(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
        await deleteSchedule(req.params.id);
        res.status(200).json({ success: true, message: "Schedule deleted" });
    } catch (error) {
        next(error);
    }
}

