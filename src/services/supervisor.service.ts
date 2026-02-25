import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, sites, shifts, incidents, guardLocations, schedules } from "../db/schema.js";
import { ApiError } from "../utils/apiError.js";
import bcrypt from "bcryptjs";
import { emitToUser } from "../websocket/index.js";

// ── Get all active shifts with guard + site info ──
export async function getActiveShifts() {
    const activeShifts = await db.query.shifts.findMany({
        where: eq(shifts.status, "active"),
        with: {
            guard: true,
            site: true,
            incidents: true,
        },
        orderBy: [desc(shifts.startTime)],
    });

    return activeShifts.map((s) => ({
        id: s.id,
        status: s.status,
        startTime: s.startTime,
        guard: { id: s.guard.id, name: s.guard.name, email: s.guard.email, badgeId: s.guard.badgeId },
        site: s.site ? { id: s.site.id, name: s.site.name, addressFrom: s.site.addressFrom } : null,
        incidentCount: s.incidents.length,
    }));
}

// ── Get shift detail with GPS location log ──
export async function getShiftDetail(shiftId: string) {
    const shift = await db.query.shifts.findFirst({
        where: eq(shifts.id, shiftId),
        with: {
            guard: true,
            site: true,
            incidents: {
                orderBy: [desc(incidents.createdAt)],
            },
            guardLocations: {
                orderBy: [guardLocations.recordedAt],
            },
        },
    });

    if (!shift) throw ApiError.notFound("Shift not found");

    return {
        id: shift.id,
        status: shift.status,
        startTime: shift.startTime,
        endTime: shift.endTime,
        timeInConfirmed: shift.timeInConfirmed,
        guard: { id: shift.guard.id, name: shift.guard.name, email: shift.guard.email, badgeId: shift.guard.badgeId },
        site: shift.site ? { id: shift.site.id, name: shift.site.name, addressFrom: shift.site.addressFrom, addressTo: shift.site.addressTo } : null,
        locationLog: shift.guardLocations.map((l) => ({
            lat: parseFloat(l.latitude),
            lng: parseFloat(l.longitude),
            accuracy: l.accuracy ? parseFloat(l.accuracy) : null,
            recordedAt: l.recordedAt,
        })),
        incidents: shift.incidents.map((i) => ({
            id: i.id,
            description: i.description,
            photoPath: i.photoPath,
            videoPath: i.videoPath,
            createdAt: i.createdAt,
        })),
    };
}

// ── List all incidents ──
export async function getAllIncidents() {
    const allIncidents = await db.query.incidents.findMany({
        with: {
            shift: {
                with: {
                    guard: true,
                    site: true,
                }
            }
        },
        orderBy: [desc(incidents.createdAt)],
    });

    return allIncidents.map((i) => ({
        id: i.id,
        shiftId: i.shiftId,
        guardName: i.shift.guard.name,
        guardBadgeId: i.shift.guard.badgeId,
        siteName: i.shift.site?.name || "Unknown Site",
        description: i.description,
        photoPath: i.photoPath,
        videoPath: i.videoPath,
        createdAt: i.createdAt,
    }));
}


// ── List all guards ──
export async function getAllGuards() {
    const guards = await db.query.users.findMany({
        where: eq(users.role, "guard"),
        orderBy: [desc(users.createdAt)],
    });

    const activeShifts = await db.query.shifts.findMany({
        where: eq(shifts.status, "active"),
        with: { site: true }
    });

    const activeShiftMap = new Map(activeShifts.map(s => [s.guardId, s]));

    const result = guards.map(guard => {
        const activeShift = activeShiftMap.get(guard.id);
        return {
            id: guard.id,
            name: guard.name,
            email: guard.email,
            badgeId: guard.badgeId,
            phone: guard.phone,
            createdAt: guard.createdAt,
            activeShift: activeShift
                ? { id: activeShift.id, siteName: activeShift.site?.name || "Unknown Site", startTime: activeShift.startTime }
                : null,
        };
    });

    return result;
}

// ── Get single guard profile + shift history ──
export async function getGuardProfile(guardId: string) {
    const guard = await db.query.users.findFirst({
        where: and(eq(users.id, guardId), eq(users.role, "guard")),
        with: {
            shifts: {
                with: { site: true },
                orderBy: [desc(shifts.startTime)],
            },
        },
    });

    if (!guard) throw ApiError.notFound("Guard not found");

    return {
        id: guard.id,
        name: guard.name,
        badgeId: guard.badgeId,
        phone: guard.phone,
        createdAt: guard.createdAt,
        shifts: guard.shifts.map((s) => ({
            id: s.id,
            siteName: s.site?.name || "Unknown Site",
            startTime: s.startTime,
            endTime: s.endTime,
            status: s.status,
            timeInConfirmed: s.timeInConfirmed,
        })),
    };
}

import { calculateResourceLimits } from "./stripe.service.js";
import { organizations } from "../db/schema.js";
import { count } from "drizzle-orm";

// ── Create a guard account ──
export async function createGuard(input: {
    name: string;
    password: string;
    badgeId: string;
    phone?: string;
    organizationId: string;
}) {
    // 1. Verify Billing limits
    const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.organizationId)
    });
    if (!org) throw ApiError.notFound("Organization not found");

    const limits = calculateResourceLimits(org);
    const [guardCountResult] = await db.select({ count: count() }).from(users)
        .where(and(eq(users.organizationId, input.organizationId), eq(users.role, "guard")));

    if (guardCountResult.count >= limits.maxGuards) {
        throw ApiError.paymentRequired(`Guard limit reached (${limits.maxGuards}). Please upgrade your plan or purchase an add-on.`);
    }

    // Auto-generate a dummy email for the database
    const generatedEmail = `${input.badgeId.toLowerCase().replace(/[^a-z0-9]/g, '')}@trazer.local`;

    // Check for duplicate badge ID within the DB
    const existingBadge = await db.query.users.findFirst({
        where: eq(users.badgeId, input.badgeId),
    });
    if (existingBadge) throw ApiError.conflict("Badge ID already in use");

    const passwordHash = await bcrypt.hash(input.password, 12);

    const [guard] = await db
        .insert(users)
        .values({
            name: input.name,
            email: generatedEmail,
            passwordHash,
            role: "guard",
            badgeId: input.badgeId,
            phone: input.phone || null,
            organizationId: input.organizationId,
        })
        .returning();

    return {
        id: guard.id,
        name: guard.name,
        email: guard.email,
        badgeId: guard.badgeId,
        phone: guard.phone,
        createdAt: guard.createdAt,
    };
}

// ── Delete a guard ──
export async function deleteGuard(guardId: string) {
    const guard = await db.query.users.findFirst({
        where: and(eq(users.id, guardId), eq(users.role, "guard")),
    });
    if (!guard) throw ApiError.notFound("Guard not found");

    await db.delete(users).where(eq(users.id, guardId));
    return { deleted: true };
}

// ── List all sites ──
export async function getAllSitesWithDetails() {
    const allSites = await db.query.sites.findMany({
        with: {
            shifts: {
                where: eq(shifts.status, "active"),
                with: { guard: true },
            },
        },
    });

    return allSites.map((s) => ({
        id: s.id,
        name: s.name,
        addressFrom: s.addressFrom,
        addressTo: s.addressTo,
        latFrom: Number(s.latFrom),
        lngFrom: Number(s.lngFrom),
        latTo: Number(s.latTo),
        lngTo: Number(s.lngTo),
        bufferMeters: s.bufferMeters,
        boundaryGeojson: s.boundaryGeojson ? JSON.parse(s.boundaryGeojson) : null,
        createdAt: s.createdAt,
        activeGuards: s.shifts.map((sh) => ({
            id: sh.guard.id,
            name: sh.guard.name,
        })),
    }));
}

// ── Create a site ──
export async function createSite(input: {
    name: string;
    addressFrom: string;
    addressTo: string;
    latFrom: number;
    lngFrom: number;
    latTo: number;
    lngTo: number;
    bufferMeters?: number;
}) {
    const buffer = input.bufferMeters || 100;

    // Generate corridor boundary GeoJSON from two points + buffer
    const boundary = generateCorridorBoundary(
        { lat: input.latFrom, lng: input.lngFrom },
        { lat: input.latTo, lng: input.lngTo },
        buffer
    );

    const [site] = await db
        .insert(sites)
        .values({
            name: input.name,
            addressFrom: input.addressFrom,
            addressTo: input.addressTo,
            latFrom: input.latFrom.toString(),
            lngFrom: input.lngFrom.toString(),
            latTo: input.latTo.toString(),
            lngTo: input.lngTo.toString(),
            bufferMeters: buffer,
            boundaryGeojson: JSON.stringify(boundary),
        })
        .returning();

    return site;
}

// ── Delete a site ──
export async function deleteSite(siteId: string) {
    const site = await db.query.sites.findFirst({
        where: eq(sites.id, siteId),
    });
    if (!site) throw ApiError.notFound("Site not found");

    await db.delete(sites).where(eq(sites.id, siteId));
    return { deleted: true };
}

// ── Generate corridor boundary polygon ──
function generateCorridorBoundary(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    bufferMeters: number
) {
    // Convert buffer from meters to approximate degrees
    const bufferLat = bufferMeters / 111320;
    const bufferLng = bufferMeters / (111320 * Math.cos(((from.lat + to.lat) / 2) * (Math.PI / 180)));

    // Calculate perpendicular offset direction
    const dx = to.lng - from.lng;
    const dy = to.lat - from.lat;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len === 0) {
        // Same point — create a circle-like box
        return {
            type: "Polygon" as const,
            coordinates: [[
                [from.lng - bufferLng, from.lat - bufferLat],
                [from.lng + bufferLng, from.lat - bufferLat],
                [from.lng + bufferLng, from.lat + bufferLat],
                [from.lng - bufferLng, from.lat + bufferLat],
                [from.lng - bufferLng, from.lat - bufferLat],
            ]],
        };
    }

    // Perpendicular unit vector
    const pxNorm = -dy / len;
    const pyNorm = dx / len;

    const px = pxNorm * bufferLng;
    const py = pyNorm * bufferLat;

    // Also extend along the main axis
    const axNorm = dx / len;
    const ayNorm = dy / len;
    const ax = axNorm * bufferLng;
    const ay = ayNorm * bufferLat;

    // 4 corners of the corridor + extensions
    return {
        type: "Polygon" as const,
        coordinates: [[
            [from.lng - px - ax, from.lat - py - ay],
            [to.lng - px + ax, to.lat - py + ay],
            [to.lng + px + ax, to.lat + py + ay],
            [from.lng + px - ax, from.lat + py - ay],
            [from.lng - px - ax, from.lat - py - ay], // close
        ]],
    };
}

// ── Generate shift text report (for PDF/display) ──
export async function generateShiftReport(shiftId: string) {
    const detail = await getShiftDetail(shiftId);

    const lines: string[] = [];
    lines.push(`SHIFT REPORT`);
    lines.push(`Guard: ${detail.guard.name} (Badge: ${detail.guard.badgeId || "N/A"})`);
    lines.push(`Site: ${detail.site?.name || "Unknown Site"}`);
    lines.push(`Route: ${detail.site?.addressFrom || "N/A"} → ${detail.site?.addressTo || "N/A"}`);
    lines.push(`Date: ${new Date(detail.startTime).toLocaleDateString()}`);
    lines.push(``);

    // Time-in
    if (detail.timeInConfirmed) {
        lines.push(`Time-in: ${new Date(detail.timeInConfirmed).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ✅ (GPS confirmed at site)`);
    } else {
        lines.push(`Time-in: ${new Date(detail.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    }

    // Location log (grouped into 10-minute intervals)
    if (detail.locationLog.length > 0) {
        lines.push(``);
        let lastTime = "";
        for (const loc of detail.locationLog) {
            const time = new Date(loc.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            if (time !== lastTime) {
                lines.push(`${time} — ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`);
                lastTime = time;
            }
        }
    }

    // Time-out
    lines.push(``);
    if (detail.endTime) {
        lines.push(`Time-out: ${new Date(detail.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} (Auto)`);
        const hours = Math.floor((new Date(detail.endTime).getTime() - new Date(detail.startTime).getTime()) / 3600000);
        const mins = Math.floor(((new Date(detail.endTime).getTime() - new Date(detail.startTime).getTime()) % 3600000) / 60000);
        lines.push(`Total Hours: ${hours}h ${mins}m`);
    } else {
        lines.push(`Status: Active (ongoing)`);
    }

    // Incidents
    if (detail.incidents.length > 0) {
        lines.push(``);
        lines.push(`INCIDENTS (${detail.incidents.length}):`);
        for (const i of detail.incidents) {
            lines.push(`  ${new Date(i.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — ${i.description}`);
        }
    }

    return {
        text: lines.join("\n"),
        data: detail,
    };
}

// ── List all schedules ──
export async function getAllSchedules() {
    const all = await db.query.schedules.findMany({
        with: { guard: true, site: true },
        orderBy: [desc(schedules.createdAt)],
    });

    const activeShifts = await db.query.shifts.findMany({
        where: eq(shifts.status, "active")
    });
    const activeGuardIds = new Set(activeShifts.map(s => s.guardId));

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    return all.map(s => ({
        id: s.id,
        guardId: s.guardId,
        guardName: s.guard.name,
        guardBadgeId: s.guard.badgeId,
        siteId: s.siteId,
        siteName: s.site?.name || "Unknown Site",
        dayOfWeek: s.dayOfWeek,
        dayName: dayNames[s.dayOfWeek] || "Unknown",
        startTime: s.startTime,
        endTime: s.endTime,
        isActive: activeGuardIds.has(s.guardId),
        createdAt: s.createdAt,
    }));
}

// ── Create a schedule ──
export async function createSchedule(input: {
    guardId: string;
    siteId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
}) {
    // Verify guard exists
    const guard = await db.query.users.findFirst({
        where: and(eq(users.id, input.guardId), eq(users.role, "guard")),
    });
    if (!guard) throw ApiError.notFound("Guard not found");

    // Verify site exists
    const site = await db.query.sites.findFirst({
        where: eq(sites.id, input.siteId),
    });
    if (!site) throw ApiError.notFound("Site not found");

    const [schedule] = await db.insert(schedules).values({
        guardId: input.guardId,
        siteId: input.siteId,
        dayOfWeek: input.dayOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
    }).returning();

    // Notify the guard via WebSocket
    emitToUser(input.guardId, "schedule:update", {
        type: "created",
        scheduleId: schedule.id
    });

    return { ...schedule, guardName: guard.name, siteName: site.name };
}

// ── Delete a schedule ──
export async function deleteSchedule(scheduleId: string) {
    const schedule = await db.query.schedules.findFirst({
        where: eq(schedules.id, scheduleId),
    });
    if (!schedule) throw ApiError.notFound("Schedule not found");

    await db.delete(schedules).where(eq(schedules.id, scheduleId));

    // Notify the guard via WebSocket
    emitToUser(schedule.guardId, "schedule:update", {
        type: "deleted",
        scheduleId: schedule.id
    });

    return { deleted: true };
}

