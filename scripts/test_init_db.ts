import { initDB } from "../src/db/index";

try {
  console.log("Testing initDB...");
  initDB();
  console.log("initDB passed.");
} catch (e) {
  console.error("initDB failed:", e);
}
