import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { shifts, sites, schedules } from "../db/schema.js";
import { ApiError } from "../utils/apiError.js";
import { StartShiftInput } from "../schemas/shift.schema.js";

export async function startShift(guardId: string, input: StartShiftInput) {
    // Verify that the site exists
    const site = await db.query.sites.findFirst({
        where: eq(sites.id, input.siteId),
    });

    if (!site) {
        throw ApiError.notFound("Site not found");
    }

    // Check if guard already has an active shift
    const activeShift = await db.query.shifts.findFirst({
        where: and(
            eq(shifts.guardId, guardId),
            eq(shifts.status, "active")
        ),
    });

    if (activeShift) {
        throw ApiError.conflict("You already have an active shift. End it before starting a new one.");
    }

    // Create new shift
    const [shift] = await db
        .insert(shifts)
        .values({
            guardId,
            siteId: input.siteId,
            status: "active",
        })
        .returning();

    return { ...shift, site };
}

export async function endShift(guardId: string, shiftId: string) {
    // Find the shift
    const shift = await db.query.shifts.findFirst({
        where: and(
            eq(shifts.id, shiftId),
            eq(shifts.guardId, guardId)
        ),
    });

    if (!shift) {
        throw ApiError.notFound("Shift not found");
    }

    if (shift.status !== "active") {
        throw ApiError.badRequest("Shift is not active");
    }

    // End the shift
    const [updatedShift] = await db
        .update(shifts)
        .set({
            status: "completed",
            endTime: new Date(),
        })
        .where(eq(shifts.id, shiftId))
        .returning();

    return updatedShift;
}

export async function getActiveShift(guardId: string) {
    const shift = await db.query.shifts.findFirst({
        where: and(
            eq(shifts.guardId, guardId),
            eq(shifts.status, "active")
        ),
        with: {
            site: true,
            incidents: true,
        },
    });

    return shift || null;
}

export async function getAllSites() {
    const allSites = await db.query.sites.findMany();
    return allSites;
}

export async function getGuardSchedules(guardId: string) {
    const guardSchedules = await db.query.schedules.findMany({
        where: eq(schedules.guardId, guardId),
        with: { site: true, guard: true },
    });

    const activeShift = await db.query.shifts.findFirst({
        where: and(eq(shifts.guardId, guardId), eq(shifts.status, "active")),
    });

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    return guardSchedules.map(s => ({
        id: s.id,
        guardName: s.guard.name,
        guardBadgeId: s.guard.badgeId,
        siteName: s.site?.name || "Unknown Site",
        dayOfWeek: s.dayOfWeek,
        dayName: dayNames[s.dayOfWeek] || "Unknown",
        startTime: s.startTime,
        endTime: s.endTime,
        isActive: activeShift?.siteId === s.siteId,
    }));
}
