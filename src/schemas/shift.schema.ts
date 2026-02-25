import { z } from "zod";

export const startShiftSchema = z.object({
    siteId: z.string().uuid("Invalid site ID"),
});

export const endShiftSchema = z.object({
    shiftId: z.string().uuid("Invalid shift ID"),
});

export type StartShiftInput = z.infer<typeof startShiftSchema>;
export type EndShiftInput = z.infer<typeof endShiftSchema>;
