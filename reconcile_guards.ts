import { db } from "./src/db/index.js";
import { users, organizations } from "./src/db/schema.js";
import { eq, isNull, and } from "drizzle-orm";

async function fix() {
    // 1. Get the primary organization
    const org = await db.query.organizations.findFirst();
    if (!org) {
        console.log("No organization found to link to.");
        process.exit(1);
    }
    console.log(`Linking guards to Org: ${org.name} (${org.id})`);

    // 2. Find guards with NO organization
    const guardsToFix = await db.query.users.findMany({
        where: and(eq(users.role, "guard"), isNull(users.organizationId))
    });

    console.log(`Found ${guardsToFix.length} guards to fix.`);

    for (const guard of guardsToFix) {
        await db.update(users)
            .set({ organizationId: org.id })
            .where(eq(users.id, guard.id));
        console.log(`- Fixed guard: ${guard.name}`);
    }

    console.log("All guards reconciled.");
    process.exit(0);
}

fix().catch(err => {
    console.error(err);
    process.exit(1);
});
