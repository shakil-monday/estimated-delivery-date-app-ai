// Runs Prisma against SQLite (local dev) or PostgreSQL (production).
//
//   node scripts/prisma.mjs <prisma args…>   e.g. `generate`, `migrate deploy`
//   node scripts/prisma.mjs sync-schema      regenerate prisma/postgres/schema.prisma
//
// PostgreSQL is used when DATABASE_URL starts with postgres:// or postgresql://.
// prisma/schema.prisma (SQLite) is the one you edit; the Postgres copy is derived from it.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const SQLITE_SCHEMA = "prisma/schema.prisma";
const POSTGRES_SCHEMA = "prisma/postgres/schema.prisma";

const args = process.argv.slice(2);

if (args[0] === "sync-schema") {
  const source = readFileSync(SQLITE_SCHEMA, "utf8");
  const datasource = /datasource db \{[\s\S]*?\n\}/;
  if (!datasource.test(source)) throw new Error("datasource block not found");
  const output =
    "// GENERATED from prisma/schema.prisma by `npm run prisma:pg-schema`. Do not edit.\n" +
    source.replace(
      datasource,
      'datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}',
    );
  writeFileSync(POSTGRES_SCHEMA, output);
  console.log(`Wrote ${POSTGRES_SCHEMA}`);
} else {
  const usePostgres = /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL || "");
  const schema = usePostgres ? POSTGRES_SCHEMA : SQLITE_SCHEMA;
  console.log(`prisma ${args.join(" ")} (${usePostgres ? "PostgreSQL" : "SQLite"})`);
  execFileSync("npx", ["prisma", ...args, "--schema", schema], { stdio: "inherit" });
}
