import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { incidents, shifts } from "../db/schema.js";
import { ApiError } from "../utils/apiError.js";
import { IncidentInput } from "../schemas/incident.schema.js";

export async function createIncident(
    guardId: string,
    input: IncidentInput,
    photoPath?: string
) {
    // Verify the shift exists and belongs to the guard
    const shift = await db.query.shifts.findFirst({
        where: and(
            eq(shifts.id, input.shiftId),
            eq(shifts.guardId, guardId)
        ),
    });

    if (!shift) {
        throw ApiError.notFound("Shift not found");
    }

    if (shift.status !== "active") {
        throw ApiError.badRequest("Cannot report incidents on an inactive shift");
    }

    // Create incident record
    const [incident] = await db
        .insert(incidents)
        .values({
            shiftId: input.shiftId,
            description: input.description,
            photoPath: photoPath || null,
        })
        .returning();

    return incident;
}
