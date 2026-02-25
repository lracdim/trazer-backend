import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "../db/index.js";
import { platformAdmins } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { ApiError } from "./apiError.js";

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "fallback_super_secret_admin_jwt";

export interface HqAuthPayload {
    adminId: string;
    role: string;
    is2FAVerified: boolean;
}

declare global {
    namespace Express {
        interface Request {
            admin?: HqAuthPayload;
        }
    }
}

/**
 * Middleware to protect Trazer HQ routes using a separate JWT secret.
 * Requires a valid token in the Authorization header or a specific admin cookie.
 */
export async function hqAuthMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
        let token: string | undefined;

        // Check auth header
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        }

        // Check cookies if no auth header
        if (!token && req.headers.cookie) {
            const cookies = req.headers.cookie.split(";").reduce((acc: Record<string, string>, current) => {
                const [name, ...value] = current.split("=");
                acc[name.trim()] = value.join("=");
                return acc;
            }, {});
            token = cookies[process.env.ADMIN_COOKIE_NAME || "trazzer_hq_session"];
        }

        if (!token) {
            throw ApiError.unauthorized("Authentication required for Trazer HQ");
        }

        const payload = jwt.verify(token, ADMIN_JWT_SECRET) as HqAuthPayload;

        // Verify admin still exists and is active
        const admin = await db.query.platformAdmins.findFirst({
            where: eq(platformAdmins.id, payload.adminId),
        });

        if (!admin || !admin.isActive) {
            throw ApiError.unauthorized("Admin account is disabled or does not exist");
        }

        // If the route strictly requires 2FA to be completed, check payload.
        // Some initial setup routes might not require 2FA verified yet (like the 2FA verify endpoint itself),
        // but for all standard dashboard routes it must be true.
        // We'll enforce it here by default, unless the route is explicitly bypassing it.
        // For flexibility, we attach the admin to req and let specific role or 2FA middlewares check it.
        req.admin = payload;

        next();
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            next(ApiError.unauthorized("Admin session expired"));
        } else if (error instanceof jwt.JsonWebTokenError) {
            next(ApiError.unauthorized("Invalid admin token"));
        } else {
            next(error);
        }
    }
}

/**
 * Middleware to enforce 2FA verification.
 */
export function require2FA(req: Request, res: Response, next: NextFunction) {
    if (!req.admin?.is2FAVerified) {
        throw ApiError.unauthorized("2FA verification required");
    }
    next();
}

/**
 * Middleware to restrict access based on HQ Role.
 */
export function hqRoleMiddleware(allowedRoles: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.admin) {
            throw ApiError.unauthorized("Admin authentication required");
        }

        if (!allowedRoles.includes(req.admin.role)) {
            throw ApiError.forbidden("Insufficient permissions for this action");
        }

        next();
    };
}
