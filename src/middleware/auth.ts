import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, TokenPayload } from "../utils/jwt.js";
import { ApiError } from "../utils/apiError.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

// Extend Express Request to include user
declare global {
    namespace Express {
        interface Request {
            user?: TokenPayload;
        }
    }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            throw ApiError.unauthorized("Missing or invalid authorization header");
        }

        const token = authHeader.split(" ")[1];
        const payload = verifyAccessToken(token);

        // ENFORCE SAAS TENANT ISOLATION RULE ON EVERY API CALL
        const dbUser = await db.query.users.findFirst({
            where: eq(users.id, payload.userId),
            with: { organization: true }
        });

        if (!dbUser) throw ApiError.unauthorized("User not found");
        if (dbUser.organization?.status === 'suspended') {
            throw ApiError.forbidden("Tenant account is suspended. API access blocked by HQ.", "COMPANY_SUSPENDED");
        }

        req.user = payload;
        next();
    } catch (error) {
        if (error instanceof ApiError) {
            next(error);
        } else {
            next(ApiError.unauthorized("Invalid or expired token"));
        }
    }
}
