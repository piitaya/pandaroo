import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";
import { dataDir } from "../stores/config.store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, "../../drizzle");

export function openDatabase(path?: string) {
  const dbPath = path ?? resolve(dataDir(), "bambu-spools.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");

  const db = drizzle({ client: sqlite, schema });
  migrate(db, { migrationsFolder });

  return { db, sqlite };
}

export type AppDatabase = ReturnType<typeof openDatabase>["db"];
