import { db } from "./src/db/index.js";
import { sql } from "drizzle-orm";

async function migrate() {
    console.log("Adding organization_id to sites table...");
    try {
        await db.execute(sql`ALTER TABLE sites ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE`);
        console.log("Column added successfully.");
    } catch (err: any) {
        if (err.message.includes("already exists")) {
            console.log("Column already exists.");
        } else {
            throw err;
        }
    }
    process.exit(0);
}

migrate().catch(err => {
    console.error(err);
    process.exit(1);
});
