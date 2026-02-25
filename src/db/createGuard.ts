import "dotenv/config";
import { db } from "./index.js";
import { users } from "./schema.js";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function createGuard() {
    const email = "john@spadesecurityservices.com";
    const existing = await db.query.users.findFirst({
        where: eq(users.email, email),
    });

    if (existing) {
        console.log("✅ User already exists:", existing.name, `(${existing.role})`);
    } else {
        const hash = await bcrypt.hash("12345678", 12);
        await db.insert(users).values({
            name: "John Guard",
            email,
            passwordHash: hash,
            role: "guard",
        });
        console.log("✅ Guard account created: john@spadesecurityservices.com / 12345678");
    }
    process.exit(0);
}

createGuard().catch((err) => {
    console.error("❌ Failed:", err);
    process.exit(1);
});
