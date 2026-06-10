import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DEFAULT_DB_PATH = 'data/rental.db';

let db: DatabaseSync | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  roomNumber TEXT NOT NULL UNIQUE,
  floor INTEGER NOT NULL,
  area REAL NOT NULL,
  monthlyRent REAL NOT NULL,
  electricRate REAL,
  waterRate REAL,
  rentMonthOffset INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('available', 'occupied', 'maintenance')),
  tenantId TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phoneNumber TEXT NOT NULL,
  idCardNumber TEXT NOT NULL,
  roomId TEXT NOT NULL REFERENCES rooms(id),
  moveInDate TEXT NOT NULL,
  moveOutDate TEXT,
  deposit REAL NOT NULL,
  active INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meter_readings (
  id TEXT PRIMARY KEY,
  roomId TEXT NOT NULL REFERENCES rooms(id),
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  electricOld REAL NOT NULL,
  electricNew REAL NOT NULL,
  waterOld REAL NOT NULL,
  waterNew REAL NOT NULL,
  readingDate TEXT NOT NULL,
  UNIQUE (roomId, month, year)
);

CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  roomId TEXT NOT NULL REFERENCES rooms(id),
  tenantId TEXT NOT NULL REFERENCES tenants(id),
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  electricUsage REAL NOT NULL,
  waterUsage REAL NOT NULL,
  electricRate REAL NOT NULL,
  waterRate REAL NOT NULL,
  electricCost REAL NOT NULL,
  waterCost REAL NOT NULL,
  roomRent REAL NOT NULL,
  rentMonth INTEGER NOT NULL DEFAULT 0,
  rentYear INTEGER NOT NULL DEFAULT 0,
  extraFees REAL NOT NULL DEFAULT 0,
  lateFee REAL NOT NULL DEFAULT 0,
  totalAmount REAL NOT NULL,
  paid INTEGER NOT NULL DEFAULT 0,
  paidDate TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE (roomId, month, year)
);

CREATE TABLE IF NOT EXISTS extra_fees (
  id TEXT PRIMARY KEY,
  roomId TEXT NOT NULL REFERENCES rooms(id),
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  electricRate REAL NOT NULL,
  waterRate REAL NOT NULL,
  lateFeeRate REAL NOT NULL
);

INSERT OR IGNORE INTO billing_config (id, electricRate, waterRate, lateFeeRate)
VALUES (1, 3500, 50000, 0.05);
`;

export function initDatabase(path: string = DEFAULT_DB_PATH): DatabaseSync {
  closeDatabase();
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

// Migration cho DB tạo từ phiên bản cũ (CREATE TABLE IF NOT EXISTS không thêm cột mới)
function migrate(database: DatabaseSync): void {
  const cols = database.prepare('PRAGMA table_info(rooms)').all() as unknown as { name: string }[];
  if (!cols.some(c => c.name === 'electricRate')) {
    database.exec('ALTER TABLE rooms ADD COLUMN electricRate REAL');
  }
  if (!cols.some(c => c.name === 'waterRate')) {
    database.exec('ALTER TABLE rooms ADD COLUMN waterRate REAL');
  }
  if (!cols.some(c => c.name === 'rentMonthOffset')) {
    database.exec('ALTER TABLE rooms ADD COLUMN rentMonthOffset INTEGER NOT NULL DEFAULT 0');
  }
  const billCols = database.prepare('PRAGMA table_info(bills)').all() as unknown as { name: string }[];
  if (!billCols.some(c => c.name === 'extraFees')) {
    database.exec('ALTER TABLE bills ADD COLUMN extraFees REAL NOT NULL DEFAULT 0');
  }
  if (!billCols.some(c => c.name === 'rentMonth')) {
    database.exec('ALTER TABLE bills ADD COLUMN rentMonth INTEGER NOT NULL DEFAULT 0');
    database.exec('ALTER TABLE bills ADD COLUMN rentYear INTEGER NOT NULL DEFAULT 0');
    // Hóa đơn cũ: tiền phòng coi như của chính kỳ thu
    database.exec('UPDATE bills SET rentMonth = month, rentYear = year WHERE rentMonth = 0');
  }
  database.exec('DROP TABLE IF EXISTS monthly_rates');
}

export function getDatabase(): DatabaseSync {
  if (!db) {
    return initDatabase();
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
