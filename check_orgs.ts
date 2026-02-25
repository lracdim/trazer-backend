import { db } from "./src/db/index.js";
import { organizations, users } from "./src/db/schema.js";
import { eq } from "drizzle-orm";

async function check() {
    const allOrgs = await db.select().from(organizations);
    console.log("Organizations:", JSON.stringify(allOrgs, null, 2));
    process.exit(0);
}

check().catch(err => {
    console.error(err);
    process.exit(1);
});
