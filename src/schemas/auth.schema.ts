import { z } from "zod";

export const registerSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters").max(255),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

// Login accepts either email (supervisor) or badge ID (guard) as identifier
export const loginSchema = z.object({
    identifier: z.string().min(1, "Badge ID or email is required"),
    password: z.string().min(1, "Password is required"),
});

export const refreshSchema = z.object({
    refreshToken: z.string().min(1, "Refresh token is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
