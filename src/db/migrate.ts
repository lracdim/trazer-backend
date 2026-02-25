import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./index.js";

async function runMigrations() {
    console.log("🔄 Running migrations...");
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("✅ Migrations complete");
    process.exit(0);
}

runMigrations().catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
});
