import { Request, Response, NextFunction } from "express";
import { db } from "../db/index.js";
import { shifts, incidents, sites, schedules, checkpoints, checkpointLogs, users } from "../db/schema.js";
import { eq, and, sql, inArray } from "drizzle-orm";
import { getIO } from "../websocket/index.js";
import { emitNotification } from "../websocket/index.js";
import { createAlert } from "../services/alert.service.js";
import { ApiError } from "../utils/apiError.js";

export async function getGuardDashboard(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = req.user!.userId;

        // Active shift
        const activeShift = await db.query.shifts.findFirst({
            where: and(
                eq(shifts.guardId, userId),
                eq(shifts.status, 'active')
            ),
            with: { site: true }
        });

        // Today's assignments (if not active yet)
        const today = new Date().getDay();
        const todaySchedules = await db.query.schedules.findMany({
            where: and(
                eq(schedules.guardId, userId),
                eq(schedules.dayOfWeek, today)
            ),
            with: { site: true }
        });

        // Today's summary (incidents logged)
        let incidentsCount = 0;
        if (activeShift) {
            const result = await db
                .select({ count: sql<number>`count(*)` })
                .from(incidents)
                .where(eq(incidents.shiftId, activeShift.id));
            incidentsCount = Number(result[0]?.count || 0);
        }

        const assigned_sites = todaySchedules.map(s => ({
            id: s.site?.id || s.siteId,
            name: s.site?.name || "Unknown",
            address: s.site?.addressFrom || "",
            startTime: s.startTime,
            endTime: s.endTime
        }));

        // Return contract
        res.status(200).json({
            success: true,
            data: {
                shift_active: !!activeShift,
                current_site_id: activeShift?.siteId || null,
                current_site_name: activeShift?.site?.name || null,
                assigned_patrol: activeShift ? {
                    id: activeShift.id,
                    site: activeShift.site?.name || "Unknown Site",
                    start_time: activeShift.startTime.toISOString(),
                    status: activeShift.status,
                } : null, daily_summary: {
                    incidents_logged: incidentsCount,
                    reports_submitted: incidentsCount
                },
                assigned_sites
            }
        });
    } catch (error) {
        next(error);
    }
}

export async function triggerPanic(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = req.user!.userId;
        const { latitude, longitude } = req.body;

        const activeShift = await db.query.shifts.findFirst({
            where: and(eq(shifts.guardId, userId), eq(shifts.status, 'active')),
            with: { guard: true, site: true }
        });

        if (!activeShift) {
            throw ApiError.badRequest("No active shift found to attach SOS to");
        }

        const msg = latitude && longitude
            ? `SOS Triggered at Lat: ${latitude}, Lng: ${longitude}`
            : `SOS Triggered (Location Unavailable)`;

        const alert = await createAlert(activeShift.id, "sos", msg);

        // Notify Command Center
        try {
            const io = getIO();
            const populatedAlert = {
                id: alert.id,
                type: alert.type,
                message: alert.message,
                createdAt: alert.createdAt,
                resolvedAt: alert.resolvedAt,
                shift: {
                    id: activeShift.id,
                    guardName: activeShift.guard.name,
                    siteName: activeShift.site?.name || "Unknown Site",
                }
            };
            io.to("supervisors").emit("alert:new", populatedAlert);

            emitNotification({
                title: "SOS ALERT",
                message: `Guard ${activeShift.guard.name} triggered SOS!`,
                type: "error"
            });

            io.to("supervisors").emit("dashboard:refresh");
        } catch (e) { }

        res.status(200).json({ success: true, message: "SOS Alert Dispatched to HQ" });
    } catch (error) {
        next(error);
    }
}

export async function getActivePatrol(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = req.user!.userId;
        const activeShift = await db.query.shifts.findFirst({
            where: and(eq(shifts.guardId, userId), eq(shifts.status, 'active')),
            with: { site: true }
        });

        if (!activeShift) {
            res.status(200).json({ success: true, data: { status: "inactive" } });
            return;
        }

        const siteCheckpoints = await db.query.checkpoints.findMany({
            where: eq(checkpoints.siteId, activeShift.site?.id || ""),
        });

        const logs = await db.query.checkpointLogs.findMany({
            where: and(
                eq(checkpointLogs.shiftId, activeShift.id),
                eq(checkpointLogs.guardId, userId)
            )
        });
        const completedIds = new Set(logs.map(l => l.checkpointId));

        res.status(200).json({
            success: true,
            data: {
                status: "active",
                map_data: {
                    geojson_boundary: activeShift.site?.boundaryGeojson || null,
                    checkpoints: siteCheckpoints.map(cp => ({
                        id: cp.id,
                        name: cp.name,
                        lat: cp.latitude,
                        lng: cp.longitude,
                        completed: completedIds.has(cp.id)
                    }))
                },
                guard_position: { lat: 0, lng: 0 }
            }
        });
    } catch (error) {
        next(error);
    }
}

export async function completeCheckpoint(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = req.user!.userId;
        const checkpointId = req.params.id as string;
        const { scanMethod } = req.body;

        const activeShift = await db.query.shifts.findFirst({
            where: and(eq(shifts.guardId, userId), eq(shifts.status, 'active'))
        });

        if (!activeShift) {
            throw ApiError.badRequest("No active shift found");
        }

        const existingLog = await db.query.checkpointLogs.findFirst({
            where: and(
                eq(checkpointLogs.shiftId, activeShift.id),
                eq(checkpointLogs.checkpointId, checkpointId)
            )
        });

        if (existingLog) {
            res.status(200).json({ success: true, message: "Checkpoint already completed" });
            return;
        }

        await db.insert(checkpointLogs).values({
            checkpointId,
            shiftId: activeShift.id,
            guardId: userId,
            scanMethod: scanMethod || 'gps'
        });

        res.status(200).json({ success: true, message: "Checkpoint completed" });
    } catch (error) {
        next(error);
    }
}

export async function getIncidentTypes(req: Request, res: Response, next: NextFunction) {
    res.status(200).json({
        success: true,
        data: [
            { id: '1', name: 'Vandalism', severity: 'low' },
            { id: '2', name: 'Theft', severity: 'high' },
            { id: '3', name: 'Suspicious Activity', severity: 'medium' },
            { id: '4', name: 'Maintenance Issue', severity: 'low' },
            { id: '5', name: 'Medical Emergency', severity: 'high' },
            { id: '6', name: 'Other', severity: 'low' }
        ]
    });
}

export async function getMyReports(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = req.user!.userId;
        const page = parseInt(req.query.page as string) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;

        const myShifts = await db.select({ id: shifts.id }).from(shifts).where(eq(shifts.guardId, userId));
        const shiftIds = myShifts.map(s => s.id);

        let myIncidents: any[] = [];
        if (shiftIds.length > 0) {
            myIncidents = await db.query.incidents.findMany({
                where: inArray(incidents.shiftId, shiftIds),
                orderBy: (incidents, { desc }) => [desc(incidents.createdAt)],
                limit,
                offset
            });
        }

        res.status(200).json({
            success: true,
            data: myIncidents
        });
    } catch (e) {
        next(e);
    }
}

export async function submitReport(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = req.user!.userId;
        const { type, description, photoUrl } = req.body;

        const activeShift = await db.query.shifts.findFirst({
            where: and(eq(shifts.guardId, userId), eq(shifts.status, 'active'))
        });

        if (!activeShift) {
            throw ApiError.badRequest("No active shift");
        }

        const fullDescription = type ? `[${type}] ${description}` : description;

        const [incident] = await db.insert(incidents).values({
            shiftId: activeShift.id,
            description: fullDescription,
            photoPath: photoUrl || null,
        }).returning();

        const guard = await db.query.users.findFirst({
            where: eq(users.id, userId)
        });

        try {
            getIO().to("supervisors").emit("dashboard:refresh");
            emitNotification({
                title: "New Incident Report",
                message: `Guard ${guard?.name} reported: ${type || 'Incident'}`,
                type: "warning"
            });
        } catch (e) { }

        res.status(201).json({ success: true, data: incident });
    } catch (e) {
        next(e);
    }
}

export async function getGuardProfile(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = req.user!.userId;
        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
            with: { organization: true }
        });

        if (!user) {
            throw ApiError.notFound("Guard not found");
        }

        const totalShiftsRes = await db.select({ count: sql<number>`count(*)` }).from(shifts).where(eq(shifts.guardId, userId));

        const myShifts = await db.select({ id: shifts.id }).from(shifts).where(eq(shifts.guardId, userId));
        let incidentsCount = 0;
        if (myShifts.length > 0) {
            const shiftIds = myShifts.map(s => s.id);
            const totalIncidentsRes = await db.select({ count: sql<number>`count(*)` }).from(incidents).where(inArray(incidents.shiftId, shiftIds));
            incidentsCount = Number(totalIncidentsRes[0]?.count || 0);
        }

        res.status(200).json({
            success: true,
            data: {
                id: user.id,
                name: user.name,
                email: user.email,
                badge_id: user.badgeId,
                status: user.status,
                company: {
                    id: user.organizationId,
                    name: user.organization?.name || 'Unknown',
                    status: user.organization?.status || 'active'
                },
                stats: {
                    total_shifts: Number(totalShiftsRes[0]?.count || 0),
                    total_incidents: incidentsCount
                }
            }
        });
    } catch (e) {
        next(e);
    }
}

export async function getGuardSchedule(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = req.user!.userId;
        const week = req.query.week || 'current';

        const mySchedules = await db.query.schedules.findMany({
            where: eq(schedules.guardId, userId),
            with: { site: true }
        });

        const assignments = mySchedules.map(s => ({
            id: s.id,
            site_id: s.siteId,
            site_name: s.site?.name || "Unknown Site",
            day_of_week: s.dayOfWeek,
            start_time: s.startTime,
            end_time: s.endTime
        }));

        res.status(200).json({
            success: true,
            data: {
                week,
                assignments
            }
        });
    } catch (e) {
        next(e);
    }
}
