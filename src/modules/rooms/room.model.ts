import { Room } from '../../types/index.js';
import { getDatabase } from '../../db/database.js';

interface RoomRow {
  id: string;
  roomNumber: string;
  floor: number;
  area: number;
  monthlyRent: number;
  electricRate: number | null;
  waterRate: number | null;
  rentMonthOffset: number;
  status: Room['status'];
  tenantId: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToRoom(row: RoomRow): Room {
  return {
    id: row.id,
    roomNumber: row.roomNumber,
    floor: row.floor,
    area: row.area,
    monthlyRent: row.monthlyRent,
    electricRate: row.electricRate ?? undefined,
    waterRate: row.waterRate ?? undefined,
    rentMonthOffset: row.rentMonthOffset,
    status: row.status,
    tenantId: row.tenantId ?? undefined,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function validateRates(room: Pick<Room, 'electricRate' | 'waterRate' | 'rentMonthOffset'>): void {
  if (room.electricRate !== undefined && room.electricRate <= 0) {
    throw new Error('Giá điện riêng của phòng phải lớn hơn 0');
  }
  if (room.waterRate !== undefined && room.waterRate <= 0) {
    throw new Error('Giá nước riêng của phòng phải lớn hơn 0');
  }
  if (room.rentMonthOffset !== undefined && ![-1, 0, 1].includes(room.rentMonthOffset)) {
    throw new Error('Tháng thu tiền phòng không hợp lệ (chỉ nhận tháng trước, chính tháng hoặc tháng sau)');
  }
}

export function createRoom(data: Omit<Room, 'id' | 'createdAt' | 'updatedAt'>): Room {
  const db = getDatabase();
  if (getRoomByNumber(data.roomNumber)) {
    throw new Error(`Phòng số ${data.roomNumber} đã tồn tại`);
  }
  const id = crypto.randomUUID();
  const now = new Date();
  const room: Room = { ...data, id, createdAt: now, updatedAt: now };
  validateRates(room);
  db.prepare(
    `INSERT INTO rooms (id, roomNumber, floor, area, monthlyRent, electricRate, waterRate, rentMonthOffset, status, tenantId, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    room.id,
    room.roomNumber,
    room.floor,
    room.area,
    room.monthlyRent,
    room.electricRate ?? null,
    room.waterRate ?? null,
    room.rentMonthOffset ?? 0,
    room.status,
    room.tenantId ?? null,
    now.toISOString(),
    now.toISOString()
  );
  return { ...room, rentMonthOffset: room.rentMonthOffset ?? 0 };
}

export function getRoom(id: string): Room | undefined {
  const row = getDatabase().prepare('SELECT * FROM rooms WHERE id = ?').get(id) as RoomRow | undefined;
  return row ? rowToRoom(row) : undefined;
}

export function getRoomByNumber(roomNumber: string): Room | undefined {
  const row = getDatabase().prepare('SELECT * FROM rooms WHERE roomNumber = ?').get(roomNumber) as RoomRow | undefined;
  return row ? rowToRoom(row) : undefined;
}

export function getAllRooms(): Room[] {
  const rows = getDatabase().prepare('SELECT * FROM rooms ORDER BY roomNumber').all() as unknown as RoomRow[];
  return rows.map(rowToRoom);
}

export function updateRoom(id: string, data: Partial<Room>): Room | undefined {
  const room = getRoom(id);
  if (!room) return undefined;
  const updated: Room = { ...room, ...data, id, updatedAt: new Date() };
  // Cho phép xóa giá riêng bằng cách truyền null
  if (data.electricRate === null) updated.electricRate = undefined;
  if (data.waterRate === null) updated.waterRate = undefined;
  validateRates(updated);
  getDatabase()
    .prepare(
      `UPDATE rooms
       SET roomNumber = ?, floor = ?, area = ?, monthlyRent = ?, electricRate = ?, waterRate = ?, rentMonthOffset = ?, status = ?, tenantId = ?, updatedAt = ?
       WHERE id = ?`
    )
    .run(
      updated.roomNumber,
      updated.floor,
      updated.area,
      updated.monthlyRent,
      updated.electricRate ?? null,
      updated.waterRate ?? null,
      updated.rentMonthOffset ?? 0,
      updated.status,
      updated.tenantId ?? null,
      updated.updatedAt.toISOString(),
      id
    );
  return updated;
}

export function deleteRoom(id: string): boolean {
  const db = getDatabase();
  const inUse = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM tenants WHERE roomId = ?)
            + (SELECT COUNT(*) FROM meter_readings WHERE roomId = ?)
            + (SELECT COUNT(*) FROM bills WHERE roomId = ?) AS total`
    )
    .get(id, id, id) as { total: number } | undefined;
  if (inUse && inUse.total > 0) {
    throw new Error('Không thể xóa phòng vì còn người thuê, chỉ số hoặc hóa đơn liên quan');
  }
  const result = db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getRoomsByStatus(status: Room['status']): Room[] {
  const rows = getDatabase()
    .prepare('SELECT * FROM rooms WHERE status = ? ORDER BY roomNumber')
    .all(status) as unknown as RoomRow[];
  return rows.map(rowToRoom);
}
