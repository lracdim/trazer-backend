import { Server as HTTPServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

let io: Server;

/**
 * Initialize Socket.io server with JWT authentication middleware.
 */
export function initWebSocket(httpServer: HTTPServer) {
    io = new Server(httpServer, {
        cors: {
            origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN,
            credentials: true,
        },
    });

    // ── JWT Authentication Middleware ──
    io.use((socket: Socket, next) => {
        const token = socket.handshake.auth?.token;

        if (!token) {
            return next(new Error("Authentication required"));
        }

        try {
            const payload = jwt.verify(token, env.JWT_SECRET) as {
                userId: string;
                role: string;
            };
            (socket as any).userId = payload.userId;
            (socket as any).userRole = payload.role;
            next();
        } catch {
            next(new Error("Invalid token"));
        }
    });

    io.on("connection", (socket: Socket) => {
        const userId = (socket as any).userId;
        const role = (socket as any).userRole;

        console.log(`🔌 Connected: ${userId} (${role})`);

        // Guards join their own room (for targeted events)
        socket.join(`user:${userId}`);

        // All web dashboard users (Admins, Supervisors, etc) join the broadcast room
        if (role !== "guard") {
            socket.join("supervisors");
        }

        // ── Guard sends location update ──
        socket.on("location:update", (data) => {
            // Broadcast to all supervisors immediately
            io.to("supervisors").emit("guard:location", {
                guardId: userId,
                ...data,
                timestamp: new Date().toISOString(),
            });
        });

        socket.on("disconnect", () => {
            console.log(`🔌 Disconnected: ${userId}`);
        });
    });

    return io;
}

/**
 * Get the Socket.io server instance.
 */
export function getIO(): Server {
    if (!io) throw new Error("Socket.io not initialized");
    return io;
}

/**
 * Emit an alert to all supervisors in real-time.
 */
export function emitAlert(alert: any) {
    if (io) {
        io.to("supervisors").emit("alert:new", alert);
    }
}

/**
 * Emit guard location to supervisors (used from REST endpoint as backup).
 */
export function emitGuardLocation(data: any) {
    if (io) {
        io.to("supervisors").emit("guard:location", data);
    }
}

/**
 * Emit a general notification to all supervisors in real-time.
 */
export function emitNotification(notification: { title: string; message: string; type: "info" | "success" | "warning" | "error" }) {
    if (io) {
        io.to("supervisors").emit("notification:new", notification);
    }
}

/**
 * Emit an event to a specific user's room.
 */
export function emitToUser(userId: string, event: string, data: any) {
    if (io) {
        io.to(`user:${userId}`).emit(event, data);
    }
}
