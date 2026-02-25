import { db } from './src/db/index.js';
import { incidents } from './src/db/schema.js';

async function main() {
    const incs = await db.select().from(incidents).limit(1);
    console.log(JSON.stringify(incs, null, 2));
    process.exit(0);
}
main();
