import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { ApiError } from "../utils/apiError.js";

/**
 * Generic Zod validation middleware factory.
 * Validates req.body against the provided schema.
 */
export function validate(schema: ZodSchema) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.body);

        if (!result.success) {
            const errors = result.error.flatten().fieldErrors;
            const message = Object.entries(errors)
                .map(([field, msgs]) => `${field}: ${(msgs as string[]).join(", ")}`)
                .join("; ");

            return next(ApiError.badRequest(`Validation failed: ${message}`));
        }

        // Replace body with parsed (and coerced) data
        req.body = result.data;
        next();
    };
}
