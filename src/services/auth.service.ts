import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, refreshTokens } from "../db/schema.js";
import {
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken,
} from "../utils/jwt.js";
import { ApiError } from "../utils/apiError.js";
import { RegisterInput, LoginInput } from "../schemas/auth.schema.js";

const SALT_ROUNDS = 12;

export async function registerUser(input: RegisterInput) {
    // Check if email already exists
    const existing = await db.query.users.findFirst({
        where: eq(users.email, input.email),
    });

    if (existing) {
        throw ApiError.conflict("Email already registered");
    }

    // Hash password
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    // Create user
    const [user] = await db
        .insert(users)
        .values({
            name: input.name,
            email: input.email,
            passwordHash,
            role: "guard",
        })
        .returning({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            createdAt: users.createdAt,
        });

    return user;
}

export async function loginUser(input: LoginInput) {
    // Try finding by badge ID first, then by email
    let user = await db.query.users.findFirst({
        where: eq(users.badgeId, input.identifier),
        with: { organization: true }
    });

    if (!user) {
        user = await db.query.users.findFirst({
            where: eq(users.email, input.identifier),
            with: { organization: true }
        });
    }

    if (!user) {
        throw ApiError.unauthorized("Invalid credentials");
    }

    if (user.status === 'suspended') {
        throw ApiError.forbidden("Your guard account has been suspended.", "GUARD_SUSPENDED");
    }

    // ENFORCE SAAS TENANT ISOLATION RULE
    if (user.organization?.status === 'suspended') {
        throw ApiError.forbidden("Your company account has been suspended by HQ. Please contact support.", "COMPANY_SUSPENDED");
    }

    // Verify password
    const valid = await bcrypt.compare(input.password, user.passwordHash);

    if (!valid) {
        throw ApiError.unauthorized("Invalid credentials");
    }

    // Generate tokens
    const payload = { userId: user.id, role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshTokenValue = generateRefreshToken(payload);

    // Hash and store refresh token
    const tokenHash = await bcrypt.hash(refreshTokenValue, SALT_ROUNDS);
    await db.insert(refreshTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    return {
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            badgeId: user.badgeId,
            role: user.role,
            status: user.status,
            company_id: user.organizationId,
        },
        accessToken,
        refreshToken: refreshTokenValue,
    };
}

export async function refreshUserToken(oldRefreshToken: string) {
    // Verify the refresh token JWT
    let payload;
    try {
        payload = verifyRefreshToken(oldRefreshToken);
    } catch {
        throw ApiError.unauthorized("Invalid or expired refresh token");
    }

    // Verify tenant is still active before issuing new token
    const dbUser = await db.query.users.findFirst({
        where: eq(users.id, payload.userId),
        with: { organization: true }
    });

    if (!dbUser) {
        throw ApiError.unauthorized("User not found");
    }

    if (dbUser.status === 'suspended') {
        throw ApiError.forbidden("Your guard account has been suspended.", "GUARD_SUSPENDED");
    }

    if (dbUser.organization?.status === 'suspended') {
        throw ApiError.forbidden("Your company account has been suspended by HQ.", "COMPANY_SUSPENDED");
    }

    // Find stored refresh tokens for the user
    const storedTokens = await db.query.refreshTokens.findMany({
        where: eq(refreshTokens.userId, payload.userId),
    });

    // Find the matching token by comparing hashes
    let matchedToken = null;
    for (const stored of storedTokens) {
        const isMatch = await bcrypt.compare(oldRefreshToken, stored.tokenHash);
        if (isMatch) {
            matchedToken = stored;
            break;
        }
    }

    if (!matchedToken) {
        // Token reuse detected — revoke all tokens for this user (security measure)
        await db.delete(refreshTokens).where(eq(refreshTokens.userId, payload.userId));
        throw ApiError.unauthorized("Refresh token has been revoked");
    }

    // Check expiration
    if (new Date(matchedToken.expiresAt) < new Date()) {
        await db.delete(refreshTokens).where(eq(refreshTokens.id, matchedToken.id));
        throw ApiError.unauthorized("Refresh token has expired");
    }

    // Rotate: delete old token, create new one
    await db.delete(refreshTokens).where(eq(refreshTokens.id, matchedToken.id));

    const newPayload = { userId: payload.userId, role: payload.role };
    const newAccessToken = generateAccessToken(newPayload);
    const newRefreshToken = generateRefreshToken(newPayload);

    const newTokenHash = await bcrypt.hash(newRefreshToken, SALT_ROUNDS);
    await db.insert(refreshTokens).values({
        userId: payload.userId,
        tokenHash: newTokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
    };
}
