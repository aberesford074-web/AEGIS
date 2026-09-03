import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import postgres from 'postgres';

const connectionString =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('Set POSTGRES_URL_NON_POOLING, POSTGRES_URL, or DATABASE_URL before running migrations.');
}

const migrationsDirectory = path.resolve('supabase/migrations');
const requestedFilename = process.argv[2]?.trim();
const allFiles = (await readdir(migrationsDirectory))
  .filter((file) => file.endsWith('.sql'))
  .sort();
if (requestedFilename && !allFiles.includes(requestedFilename)) {
  throw new Error(`Migration ${requestedFilename} does not exist.`);
}
const files = requestedFilename ? [requestedFilename] : allFiles;

const sql = postgres(connectionString, {
  max: 1,
  ssl: 'require',
  connect_timeout: 20,
  idle_timeout: 5
});

try {
  await sql`
    create table if not exists aegis_schema_migrations (
      filename text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `;

  for (const filename of files) {
    const contents = await readFile(path.join(migrationsDirectory, filename), 'utf8');
    const checksum = createHash('sha256').update(contents).digest('hex');
    const [existing] = await sql`
      select checksum from aegis_schema_migrations where filename = ${filename}
    `;

    if (existing) {
      if (existing.checksum !== checksum) {
        throw new Error(`Applied migration ${filename} has changed. Add a new migration instead.`);
      }
      console.log(`Already applied: ${filename}`);
      continue;
    }

    await sql.begin(async (transaction) => {
      await transaction.unsafe(contents);
      await transaction`
        insert into aegis_schema_migrations (filename, checksum)
        values (${filename}, ${checksum})
      `;
    });
    console.log(`Applied: ${filename}`);
  }
} finally {
  await sql.end();
}
