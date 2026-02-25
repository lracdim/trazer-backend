import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/apiError.js";
import { env } from "../config/env.js";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
    // Log error in development
    if (env.NODE_ENV === "development") {
        console.error("❌ Error:", err);
    }

    if (err instanceof ApiError) {
        res.status(err.statusCode).json({
            success: false,
            message: err.message,
            ...(err.code && { code: err.code })
        });
        return;
    }

    // Handle Multer errors
    if (err.message === "File too large") {
        res.status(413).json({
            success: false,
            message: "File size exceeds the limit (5MB)",
        });
        return;
    }

    // Unexpected errors
    res.status(500).json({
        success: false,
        message: env.NODE_ENV === "production" ? "Internal server error" : err.message,
    });
}
