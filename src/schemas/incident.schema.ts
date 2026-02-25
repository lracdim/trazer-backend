import { z } from "zod";

export const incidentSchema = z.object({
    shiftId: z.string().uuid("Invalid shift ID"),
    description: z.string().min(10, "Description must be at least 10 characters").max(2000),
});

export type IncidentInput = z.infer<typeof incidentSchema>;
