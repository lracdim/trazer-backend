import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/apiError.js";

// ── Role Hierarchy (higher number = more privileged) ──
export const ROLE_HIERARCHY: Record<string, number> = {
    guard: 0,
    supervisor: 1,
    manager: 2,
    admin: 3,
    owner: 4,
};

// ── Exact role match (existing — unchanged) ──
export function requireRole(...roles: string[]) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        if (!req.user) {
            return next(ApiError.unauthorized("Authentication required"));
        }

        if (!roles.includes(req.user.role)) {
            return next(ApiError.forbidden("Insufficient permissions"));
        }

        next();
    };
}

// ── Hierarchical role check (new) ──
export function requireMinRole(minRole: string) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        if (!req.user) {
            return next(ApiError.unauthorized("Authentication required"));
        }

        const userLevel = ROLE_HIERARCHY[req.user.role] ?? -1;
        const requiredLevel = ROLE_HIERARCHY[minRole] ?? 999;

        if (userLevel < requiredLevel) {
            return next(ApiError.forbidden("Insufficient permissions"));
        }

        next();
    };
}
