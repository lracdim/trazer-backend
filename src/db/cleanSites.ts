import "dotenv/config";
import { db } from "./index.js";
import { sites } from "./schema.js";

async function cleanSites() {
    console.log("🧹 Removing all sites...\n");
    const allSites = await db.query.sites.findMany();
    for (const site of allSites) {
        await db.delete(sites).where((await import("drizzle-orm")).eq(sites.id, site.id));
        console.log(`❌ Deleted: "${site.name}"`);
    }
    console.log("\n✅ All sites removed.");
    process.exit(0);
}

cleanSites().catch((err) => {
    console.error("❌ Failed:", err);
    process.exit(1);
});
