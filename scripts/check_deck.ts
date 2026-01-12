import { initDB, db } from "../src/db/index";
import { things } from "../src/db/schema";
import { eq, count } from "drizzle-orm";

initDB();

async function check() {
    const result = await db.select({ count: count() }).from(things).where(eq(things.location, "DECK"));
    console.log("Items in Deck:", result[0].count);
    
    const sample = await db.select().from(things).limit(5);
    console.log("Sample items:", sample);
}

check();
