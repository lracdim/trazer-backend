import "dotenv/config";
import { db } from "./index.js";
import { users } from "./schema.js";
import bcrypt from "bcryptjs";

async function seed() {
    console.log("🌱 Seeding database...\n");

    // ── Supervisor account ──
    const supervisorEmail = "supervisor@spadesecurity.com";
    const existing = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.email, supervisorEmail),
    });

    if (!existing) {
        const hash = await bcrypt.hash("Supervisor123!", 12);
        await db.insert(users).values({
            name: "Supervisor Admin",
            email: supervisorEmail,
            passwordHash: hash,
            role: "supervisor",
        });
        console.log("✅ Supervisor created: supervisor@spadesecurity.com / Supervisor123!");
    } else {
        console.log("⏭️  Supervisor already exists");
    }

    // ── Owner / Admin account ──
    const adminEmail = "admin@spadesecurity.com";
    const existingAdmin = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.email, adminEmail),
    });

    if (!existingAdmin) {
        const hash = await bcrypt.hash("Admin123!", 12);
        await db.insert(users).values({
            name: "System Admin",
            email: adminEmail,
            passwordHash: hash,
            role: "admin",
        });
        console.log("✅ Admin created: admin@spadesecurity.com / Admin123!");
    } else {
        console.log("⏭️  Admin already exists");
    }

    console.log("\n🎉 Seed complete! Add sites and guards via the dashboard.");
    process.exit(0);
}

seed().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
});
