import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;

export function createDatabase(binding: D1Database): AppDatabase {
  return drizzle(binding, { schema });
}
