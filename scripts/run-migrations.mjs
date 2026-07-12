import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const migrationsDir = join(process.cwd(), "db", "migrations");
const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

const { Client } = pg;
const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await markExistingBaseline("0001_initial.sql", "public.app_users");
  await markExistingBaseline("0002_schedule_events.sql", "public.schedule_events");

  const appliedResult = await client.query("SELECT filename FROM schema_migrations");
  const appliedFiles = new Set(appliedResult.rows.map((row) => row.filename));

  for (const file of migrationFiles) {
    if (appliedFiles.has(file)) {
      console.log(`Skipped migration: ${file}`);
      continue;
    }

    const sql = readFileSync(join(migrationsDir, file), "utf8");

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`Applied migration: ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} catch (error) {
  console.error(formatMigrationError(error));
  process.exitCode = 1;
} finally {
  await client.end();
}

async function markExistingBaseline(filename, relationName) {
  if (!migrationFiles.includes(filename)) {
    return;
  }

  const relationResult = await client.query("SELECT to_regclass($1) AS relation", [relationName]);
  if (!relationResult.rows[0]?.relation) {
    return;
  }

  await client.query(
    "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING",
    [filename]
  );
}

function formatMigrationError(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const lines = [`${error.name}: ${error.message || "migration failed"}`];

  if ("code" in error && error.code) {
    lines[0] += ` (${error.code})`;
  }

  if (Array.isArray(error.errors)) {
    for (const inner of error.errors) {
      if (!(inner instanceof Error)) {
        continue;
      }

      const detail = [
        inner.message,
        "code" in inner && inner.code ? `code=${inner.code}` : undefined,
        "address" in inner && inner.address ? `address=${inner.address}` : undefined,
        "port" in inner && inner.port ? `port=${inner.port}` : undefined
      ]
        .filter(Boolean)
        .join(" ");
      lines.push(`- ${detail}`);
    }
  }

  return lines.join("\n");
}
