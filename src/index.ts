import express from "express";
import { createServer } from "http";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";

import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { initWebSocket } from "./websocket/index.js";

import authRoutes from "./routes/auth.routes.js";
import shiftRoutes from "./routes/shift.routes.js";
import incidentRoutes from "./routes/incident.routes.js";
import supervisorRoutes from "./routes/supervisor.routes.js";
import locationRoutes from "./routes/location.routes.js";
import alertRoutes from "./routes/alert.routes.js";
import adminRoutes from "./routes/admin.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// ========================
// Socket.io
// ========================
initWebSocket(httpServer);

// ========================
// Global Middleware
// ========================
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin: env.CORS_ORIGIN === '*'
    ? true  // Accept all origins in dev (allows credentials)
    : env.CORS_ORIGIN,
  credentials: true,
}));
import { handleStripeWebhook } from "./controllers/stripe.webhook.js";

// Stripe webhook requires raw body for signature verification
app.post("/api/webhook/stripe", express.raw({ type: 'application/json' }), handleStripeWebhook);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use("/uploads", express.static(path.resolve(__dirname, "../uploads")));

// ========================
// Health Check
// ========================
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ========================
// API Routes
// ========================
app.use("/api/auth", authRoutes);
app.use("/api/shifts", shiftRoutes);
app.use("/api/incidents", incidentRoutes);
app.use("/api/supervisor", supervisorRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/alerts", alertRoutes);
// Trazer Platform Mobile specific
import mobileRoutes from "./routes/mobile.routes.js";
app.use("/api/mobile", mobileRoutes);

app.use("/api/admin", adminRoutes);

// Trazer Platform HQ
import hqRoutes from "./routes/hq.routes.js";
app.use("/api/hq", hqRoutes);

// ========================
// Global Error Handler (must be last)
// ========================
app.use(errorHandler);

// ========================
// Start Server (HTTP + WebSocket)
// ========================
httpServer.listen(env.PORT, () => {
  console.log(`
  🛡️  Security Command & Control System
  📍 API:        http://localhost:${env.PORT}
  🔌 WebSocket:  ws://localhost:${env.PORT}
  🌍 Environment: ${env.NODE_ENV}
  🔗 Health:      http://localhost:${env.PORT}/api/health
  `);
});

export default app;
