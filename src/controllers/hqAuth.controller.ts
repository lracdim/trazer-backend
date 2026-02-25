import { Request, Response, NextFunction } from "express";
import { adminLogin, generate2FASecret, verify2FA } from "../utils/hqAuth.service.js";
import { HqAuthPayload } from "../utils/hqAuth.middleware.js";

// Cookie name for platform admin sessions
const COOKIE_NAME = process.env.ADMIN_COOKIE_NAME || "trazzer_hq_session";
const COOKIE_OPTS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: 30 * 60 * 1000, // 30 minutes
};

export async function login(req: Request, res: Response, next: NextFunction) {
    try {
        const { email, password } = req.body;
        const result = await adminLogin(email, password, req.ip, req.headers["user-agent"]);

        // Issue short-lived HTTP-only cookie
        res.cookie(COOKIE_NAME, result.token, COOKIE_OPTS);

        res.status(200).json({ success: true, data: result.admin });
    } catch (error) {
        next(error);
    }
}

export async function setup2FA(req: Request, res: Response, next: NextFunction) {
    try {
        // Authenticated but 2FA not verified yet
        const adminId = req.admin!.adminId;

        const result = await generate2FASecret(adminId);

        // Expose only the setup key (User explicitly requested NO QR codes)
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}

export async function verifyTwoFactor(req: Request, res: Response, next: NextFunction) {
    try {
        // Must be partially authenticated (JWT valid, but is2FAVerified may be false)
        const adminId = req.admin!.adminId;
        const { token } = req.body;

        const result = await verify2FA(adminId, token, req.ip, req.headers["user-agent"]);

        // Replace the old partial cookie with the fully authenticated one
        res.cookie(COOKIE_NAME, result.token, COOKIE_OPTS);

        res.status(200).json({ success: true, message: "2FA Verified successfully" });
    } catch (error) {
        next(error);
    }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
    try {
        res.clearCookie(COOKIE_NAME);
        res.status(200).json({ success: true, message: "Logged out from Trazer HQ" });
    } catch (error) {
        next(error);
    }
}

export async function me(req: Request, res: Response, next: NextFunction) {
    try {
        res.status(200).json({ success: true, data: req.admin });
    } catch (error) {
        next(error);
    }
}
