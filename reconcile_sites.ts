import { db } from "./src/db/index.js";
import { sites, organizations } from "./src/db/schema.js";
import { eq, isNull } from "drizzle-orm";

async function fix() {
    // 1. Get the primary organization
    const org = await db.query.organizations.findFirst();
    if (!org) {
        console.log("No organization found to link to.");
        process.exit(1);
    }
    console.log(`Linking sites to Org: ${org.name} (${org.id})`);

    // 2. Find sites with NO organization
    const sitesToFix = await db.query.sites.findMany({
        where: isNull(sites.organizationId)
    });

    console.log(`Found ${sitesToFix.length} sites to fix.`);

    for (const site of sitesToFix) {
        await db.update(sites)
            .set({ organizationId: org.id })
            .where(eq(sites.id, site.id));
        console.log(`- Fixed site: ${site.name}`);
    }

    console.log("All sites reconciled.");
    process.exit(0);
}

fix().catch(err => {
    console.error(err);
    process.exit(1);
});
