require("dotenv").config();
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, "data", "cards.db");

// Make sure the folder the db file lives in actually exists.
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

// Idempotent - safe to run on every boot. This is the one table
// the whole system needs (see playbook section 2). destination_url is
// nullable: a card can exist "unclaimed" (id + NFC/QR already made,
// no client assigned yet) before it's given a real destination.
db.exec(`
  CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    destination_url TEXT,
    client_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migration: add edit_token if this db predates the self-serve edit feature.
// Safe to run on every boot - no-ops once the column exists.
const columns = db.prepare("PRAGMA table_info(cards)").all();
const hasEditToken = columns.some((c) => c.name === "edit_token");
if (!hasEditToken) {
  db.exec("ALTER TABLE cards ADD COLUMN edit_token TEXT");
  const backfill = db.prepare("UPDATE cards SET edit_token = ? WHERE id = ?");
  const rowsNeedingToken = db
    .prepare("SELECT id FROM cards WHERE edit_token IS NULL")
    .all();
  for (const row of rowsNeedingToken) {
    backfill.run(crypto.randomBytes(32).toString("base64url"), row.id);
  }
}

// Migration: relax destination_url from NOT NULL to nullable, for dbs
// created before bulk/unclaimed-card support existed. SQLite can't drop
// a NOT NULL constraint directly, so this rebuilds the table - standard
// and safe, wrapped in a transaction. No-ops once already nullable.
const destinationCol = db
  .prepare("PRAGMA table_info(cards)")
  .all()
  .find((c) => c.name === "destination_url");
if (destinationCol && destinationCol.notnull === 1) {
  const relaxNotNull = db.transaction(() => {
    db.exec(`
      CREATE TABLE cards_new (
        id TEXT PRIMARY KEY,
        destination_url TEXT,
        client_name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        edit_token TEXT
      );
    `);
    db.exec(`
      INSERT INTO cards_new (id, destination_url, client_name, created_at, edit_token)
      SELECT id, destination_url, client_name, created_at, edit_token FROM cards;
    `);
    db.exec("DROP TABLE cards;");
    db.exec("ALTER TABLE cards_new RENAME TO cards;");
  });
  relaxNotNull();
}

module.exports = db;
