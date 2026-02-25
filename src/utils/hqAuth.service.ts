import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { platformAdmins } from "../db/schema.js";
import { ApiError } from "./apiError.js";
import { logAdminAction } from "./hqLogger.js";
import { TOTP } from "@otplib/totp";
import { NodeCryptoPlugin } from "@otplib/plugin-crypto-node";
import { ScureBase32Plugin } from "@otplib/plugin-base32-scure";
import jwt from "jsonwebtoken";

const authenticator = new TOTP({
    crypto: new NodeCryptoPlugin(),
    base32: new ScureBase32Plugin()
});

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "fallback_super_secret_admin_jwt";

export interface HqAuthPayload {
    adminId: string;
    role: string;
    is2FAVerified: boolean;
}

export function generateHqToken(payload: HqAuthPayload): string {
    return jwt.sign(payload, ADMIN_JWT_SECRET, { expiresIn: "30m" }); // 30 minutes short-lived
}

export async function adminLogin(email: string, password: string, ipAddress?: string, userAgent?: string) {
    const admin = await db.query.platformAdmins.findFirst({
        where: eq(platformAdmins.email, email),
    });

    if (!admin) {
        throw ApiError.unauthorized("Invalid credentials");
    }

    if (!admin.isActive) {
        throw ApiError.unauthorized("Account has been disabled");
    }

    if (admin.lockedUntil && new Date(admin.lockedUntil) > new Date()) {
        throw ApiError.unauthorized("Account is temporarily locked due to failed login attempts");
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);

    if (!valid) {
        // Increment failed attempts
        const attempts = admin.failedAttempts + 1;
        let updateData: any = { failedAttempts: attempts };

        if (attempts >= 5) {
            updateData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // lock for 15 minutes
            updateData.failedAttempts = 0; // reset counter after locking
            await logAdminAction({
                adminId: admin.id,
                actionType: "auth.lockout",
                ipAddress,
                userAgent
            });
        }
        await db.update(platformAdmins).set(updateData).where(eq(platformAdmins.id, admin.id));
        throw ApiError.unauthorized("Invalid credentials");
    }

    // Reset failed attempts if successful
    await db.update(platformAdmins).set({
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date()
    }).where(eq(platformAdmins.id, admin.id));

    // Determine if 2FA needs setup
    const needs2FASetup = !admin.twoFactorSecret;

    // Issue initial JWT with is2FAVerified = true (Bypassing 2FA)
    const payload: HqAuthPayload = {
        adminId: admin.id,
        role: admin.role,
        is2FAVerified: true,
    };

    await logAdminAction({
        adminId: admin.id,
        actionType: "auth.login_initial",
        ipAddress,
        userAgent
    });

    return {
        token: generateHqToken(payload),
        admin: {
            id: admin.id,
            email: admin.email,
            role: admin.role,
            needs2FASetup: false
        }
    };
}

export async function generate2FASecret(adminId: string) {
    const admin = await db.query.platformAdmins.findFirst({
        where: eq(platformAdmins.id, adminId),
    });

    if (!admin) throw ApiError.notFound("Admin not found");

    if (admin.twoFactorSecret) {
        throw ApiError.badRequest("2FA is already configured for this account");
    }

    const secret = authenticator.generateSecret();

    // Save the secret temporarily or directly? We'll save it directly, but flag it as verified via verification step.
    // For a cleaner flow, we could save it now, and wait for them to verify it.
    await db.update(platformAdmins).set({ twoFactorSecret: secret }).where(eq(platformAdmins.id, adminId));

    // Provide the setup key to the user
    // Instructions: the user opted out of QR codes. 
    // They will manually type this setup key into Google Authenticator / Authy.
    const setupKey = secret;

    return { setupKey };
}

export async function verify2FA(adminId: string, token: string, ipAddress?: string, userAgent?: string) {
    const admin = await db.query.platformAdmins.findFirst({
        where: eq(platformAdmins.id, adminId),
    });

    if (!admin || !admin.twoFactorSecret) {
        throw ApiError.badRequest("2FA setup is incomplete or missing");
    }

    const result = await authenticator.verify(token, { secret: admin.twoFactorSecret });

    if (!result.valid) {
        throw ApiError.unauthorized("Invalid 2FA token");
    }

    // Issue fully authenticated JWT
    const payload: HqAuthPayload = {
        adminId: admin.id,
        role: admin.role,
        is2FAVerified: true,
    };

    await logAdminAction({
        adminId: admin.id,
        actionType: "auth.2fa_verified",
        ipAddress,
        userAgent
    });

    return {
        token: generateHqToken(payload)
    };
}
