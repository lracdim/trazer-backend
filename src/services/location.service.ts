import { eq, desc, and, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { guardLocations, shifts, alerts } from "../db/schema.js";
import { isPointInPolygon, parseBoundary, haversineDistance } from "./geofence.service.js";
import { createAlert, type AlertType } from "./alert.service.js";

interface LocationInput {
    latitude: number;
    longitude: number;
    accuracy?: number;
    speed?: number;
    heading?: number;
    recordedAt?: string;
}

/**
 * Record GPS locations (batch insert) and run geo-fence + idle checks.
 * Returns alerts generated (if any).
 */
export async function recordLocations(
    guardId: string,
    shiftId: string,
    locations: LocationInput[]
) {
    if (locations.length === 0) return { inserted: 0, alerts: [] };

    // Verify shift belongs to guard and is active
    const shift = await db.query.shifts.findFirst({
        where: and(eq(shifts.id, shiftId), eq(shifts.guardId, guardId), eq(shifts.status, "active")),
        with: { site: true },
    });

    if (!shift) return { inserted: 0, alerts: [] };

    // Batch insert locations
    const values = locations.map((loc) => ({
        guardId,
        shiftId,
        latitude: loc.latitude.toString(),
        longitude: loc.longitude.toString(),
        accuracy: loc.accuracy?.toString() ?? null,
        speed: loc.speed?.toString() ?? null,
        heading: loc.heading?.toString() ?? null,
        recordedAt: loc.recordedAt ? new Date(loc.recordedAt) : new Date(),
    }));

    await db.insert(guardLocations).values(values);

    // ── Run geo-fence check on latest position ──
    const generatedAlerts: any[] = [];
    const latest = locations[locations.length - 1];
    const boundary = parseBoundary(shift.site?.boundaryGeojson || null);

    if (boundary) {
        const inside = isPointInPolygon(
            { lat: latest.latitude, lng: latest.longitude },
            boundary
        );

        if (!inside) {
            const alert = await createAlert(
                shiftId,
                "out_of_bounds",
                `Guard left the boundary of ${shift.site?.name || "Unknown Site"}`
            );
            generatedAlerts.push(alert);
        }
    }

    // ── Idle detection ──
    // Check last 5 minutes of locations — if movement < 10 meters, generate idle alert
    const recentLocations = await db.query.guardLocations.findMany({
        where: eq(guardLocations.shiftId, shiftId),
        orderBy: [desc(guardLocations.recordedAt)],
        limit: 10,
    });

    if (recentLocations.length >= 5) {
        const newest = recentLocations[0];
        const oldest = recentLocations[recentLocations.length - 1];

        const timeDiffMs =
            new Date(newest.recordedAt).getTime() - new Date(oldest.recordedAt).getTime();

        // Only check if we have at least 5 minutes of data
        if (timeDiffMs >= 5 * 60 * 1000) {
            const maxDistance = recentLocations.reduce((max, loc, i) => {
                if (i === 0) return 0;
                const prev = recentLocations[i - 1];
                const dist = haversineDistance(
                    { lat: parseFloat(loc.latitude), lng: parseFloat(loc.longitude) },
                    { lat: parseFloat(prev.latitude), lng: parseFloat(prev.longitude) }
                );
                return Math.max(max, dist);
            }, 0);

            const totalTravel = recentLocations.reduce((sum, loc, i) => {
                if (i === 0) return 0;
                const prev = recentLocations[i - 1];
                return (
                    sum +
                    haversineDistance(
                        { lat: parseFloat(loc.latitude), lng: parseFloat(loc.longitude) },
                        { lat: parseFloat(prev.latitude), lng: parseFloat(prev.longitude) }
                    )
                );
            }, 0);

            if (totalTravel < 10) {
                const alert = await createAlert(
                    shiftId,
                    "idle",
                    `Guard has been stationary at ${shift.site?.name || "Unknown Site"} for over 5 minutes`
                );
                generatedAlerts.push(alert);
            }
        }
    }

    return { inserted: locations.length, alerts: generatedAlerts };
}

/**
 * Get route for a shift (for route playback).
 */
export async function getShiftRoute(shiftId: string) {
    const locations = await db.query.guardLocations.findMany({
        where: eq(guardLocations.shiftId, shiftId),
        orderBy: [guardLocations.recordedAt],
    });

    return locations.map((l) => ({
        lat: parseFloat(l.latitude),
        lng: parseFloat(l.longitude),
        accuracy: l.accuracy ? parseFloat(l.accuracy) : null,
        speed: l.speed ? parseFloat(l.speed) : null,
        heading: l.heading ? parseFloat(l.heading) : null,
        recordedAt: l.recordedAt,
    }));
}

/**
 * Get latest location for active guards (for live map).
 */
export async function getActiveGuardLocations() {
    const activeShifts = await db.query.shifts.findMany({
        where: eq(shifts.status, "active"),
        with: {
            guard: true,
            site: true,
        },
    });

    const result = [];
    for (const shift of activeShifts) {
        const latestLocation = await db.query.guardLocations.findFirst({
            where: eq(guardLocations.shiftId, shift.id),
            orderBy: [desc(guardLocations.recordedAt)],
        });

        // Determine status based on alerts
        let status: "normal" | "out_of_bounds" | "idle" | "offline" = "normal";
        let finalLocation = null;

        if (!latestLocation) {
            // Guard just started shift but no GPS ping yet: Fallback to site coordinates
            status = "normal";
            if (shift.site?.latFrom && shift.site?.lngFrom) {
                finalLocation = {
                    lat: parseFloat(shift.site.latFrom!),
                    lng: parseFloat(shift.site.lngFrom!),
                    recordedAt: new Date().toISOString(),
                };
            } else {
                status = "offline"; // No fallback possible
            }
        } else {
            const timeSinceUpdate =
                Date.now() - new Date(latestLocation.recordedAt).getTime();
            if (timeSinceUpdate > 90000) {
                status = "offline";
            }
            finalLocation = {
                lat: parseFloat(latestLocation.latitude),
                lng: parseFloat(latestLocation.longitude),
                recordedAt: latestLocation.recordedAt,
            };
        }

        // Check for active unresolved alerts
        const unresolvedAlerts = await db.query.alerts.findMany({
            where: and(
                eq(alerts.shiftId, shift.id),
                isNull(alerts.resolvedAt)
            ),
        });

        // Prioritize worst alert
        for (const a of unresolvedAlerts) {
            if (a.type === "out_of_bounds") status = "out_of_bounds";
            else if (a.type === "idle" && status !== "out_of_bounds") status = "idle";
        }

        result.push({
            guardId: shift.guard.id,
            guardName: shift.guard.name,
            shiftId: shift.id,
            siteName: shift.site?.name || "Unknown Site",
            status,
            location: finalLocation,
        });
    }

    return result;
}
