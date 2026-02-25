import { db } from "./src/db/index.js";
import { users, organizations } from "./src/db/schema.js";
import { eq } from "drizzle-orm";

async function diagnose() {
    const allUsers = await db.query.users.findMany();
    console.log("ALL USERS IN DB:");
    allUsers.forEach(u => {
        console.log(`- ID: ${u.id}, Name: ${u.name}, Role: ${u.role}, OrgID: ${u.organizationId}`);
    });

    const allOrgs = await db.query.organizations.findMany();
    console.log("\nALL ORGANIZATIONS IN DB:");
    allOrgs.forEach(o => {
        console.log(`- ID: ${o.id}, Name: ${o.name}`);
    });

    process.exit(0);
}

diagnose().catch(err => {
    console.error(err);
    process.exit(1);
});
