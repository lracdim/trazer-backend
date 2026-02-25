import { db } from "./src/db/index.js";
import { users, organizations } from "./src/db/schema.js";
import { eq, and, count } from "drizzle-orm";

async function diagnose() {
    const orgs = await db.query.organizations.findMany();
    for (const org of orgs) {
        const [cnt] = await db.select({ count: count() }).from(users)
            .where(and(eq(users.organizationId, org.id), eq(users.role, "guard")));
        console.log(`Org: ${org.name} (ID: ${org.id}), Guards: ${cnt.count}`);
    }

    const [noOrgCnt] = await db.select({ count: count() }).from(users)
        .where(and(sql`organization_id IS NULL`, eq(users.role, "guard")));
    console.log(`Guards with NO Org: ${noOrgCnt.count}`);

    process.exit(0);
}

import { sql } from "drizzle-orm";

diagnose().catch(err => {
    console.error(err);
    process.exit(1);
});
