import { Request, Response, NextFunction } from "express";
import { registerUser, loginUser, refreshUserToken } from "../services/auth.service.js";

export async function register(req: Request, res: Response, next: NextFunction) {
    try {
        const user = await registerUser(req.body);
        res.status(201).json({ success: true, data: user });
    } catch (error) {
        next(error);
    }
}

export async function login(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await loginUser(req.body);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
    try {
        const tokens = await refreshUserToken(req.body.refreshToken);
        res.status(200).json({ success: true, data: tokens });
    } catch (error) {
        next(error);
    }
}

export async function validateSession(req: Request, res: Response, next: NextFunction) {
    try {
        res.status(200).json({ success: true, data: { status: "active", user: req.user } });
    } catch (error) {
        next(error);
    }
}
