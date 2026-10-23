/** Apply migrations to DATABASE_URL (or the embedded PGlite store). */
import { getDb } from "../src/lib/db/client";

getDb()
  .then(() => {
    console.log(`Migrations applied (${process.env.DATABASE_URL ? "PostgreSQL" : "embedded PGlite at .data/pglite"}).`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
