import { Tenant, TenantSummary } from '../../types/index.js';
import { getDatabase } from '../../db/database.js';
import { getRoom, updateRoom } from '../rooms/room.model.js';

interface TenantRow {
  id: string;
  name: string;
  phoneNumber: string;
  idCardNumber: string;
  roomId: string;
  moveInDate: string;
  moveOutDate: string | null;
  deposit: number;
  active: number;
  createdAt: string;
  updatedAt: string;
}

function rowToTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    phoneNumber: row.phoneNumber,
    idCardNumber: row.idCardNumber,
    roomId: row.roomId,
    moveInDate: new Date(row.moveInDate),
    moveOutDate: row.moveOutDate ? new Date(row.moveOutDate) : undefined,
    deposit: row.deposit,
    active: row.active === 1,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

export function createTenant(data: Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'>): Tenant {
  const room = getRoom(data.roomId);
  if (!room) {
    throw new Error(`Phòng không tồn tại: ${data.roomId}`);
  }
  if (data.active) {
    if (room.status === 'maintenance') {
      throw new Error(`Phòng ${room.roomNumber} đang bảo trì, không thể nhận người thuê`);
    }
    if (room.tenantId) {
      throw new Error(`Phòng ${room.roomNumber} đã có người thuê`);
    }
  }
  const id = crypto.randomUUID();
  const now = new Date();
  const tenant: Tenant = { ...data, id, createdAt: now, updatedAt: now };
  getDatabase()
    .prepare(
      `INSERT INTO tenants (id, name, phoneNumber, idCardNumber, roomId, moveInDate, moveOutDate, deposit, active, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      tenant.id,
      tenant.name,
      tenant.phoneNumber,
      tenant.idCardNumber,
      tenant.roomId,
      tenant.moveInDate.toISOString(),
      tenant.moveOutDate?.toISOString() ?? null,
      tenant.deposit,
      tenant.active ? 1 : 0,
      now.toISOString(),
      now.toISOString()
    );
  if (tenant.active) {
    updateRoom(room.id, { tenantId: tenant.id, status: 'occupied' });
  }
  return tenant;
}

export function getTenant(id: string): Tenant | undefined {
  const row = getDatabase().prepare('SELECT * FROM tenants WHERE id = ?').get(id) as TenantRow | undefined;
  return row ? rowToTenant(row) : undefined;
}

export function getAllTenants(): Tenant[] {
  const rows = getDatabase().prepare('SELECT * FROM tenants ORDER BY name').all() as unknown as TenantRow[];
  return rows.map(rowToTenant);
}

export function updateTenant(id: string, data: Partial<Tenant>): Tenant | undefined {
  const tenant = getTenant(id);
  if (!tenant) return undefined;
  const updated: Tenant = { ...tenant, ...data, id, updatedAt: new Date() };
  getDatabase()
    .prepare(
      `UPDATE tenants
       SET name = ?, phoneNumber = ?, idCardNumber = ?, roomId = ?, moveInDate = ?, moveOutDate = ?, deposit = ?, active = ?, updatedAt = ?
       WHERE id = ?`
    )
    .run(
      updated.name,
      updated.phoneNumber,
      updated.idCardNumber,
      updated.roomId,
      updated.moveInDate.toISOString(),
      updated.moveOutDate?.toISOString() ?? null,
      updated.deposit,
      updated.active ? 1 : 0,
      updated.updatedAt.toISOString(),
      id
    );
  return updated;
}

/**
 * Gán người thuê (mới hoặc đã trả phòng trước đây) vào một phòng trống —
 * kích hoạt lại hồ sơ cũ thay vì tạo bản ghi trùng.
 */
export function assignTenantToRoom(
  tenantId: string,
  roomId: string,
  options?: { moveInDate?: Date; deposit?: number }
): Tenant {
  const tenant = getTenant(tenantId);
  if (!tenant) {
    throw new Error(`Người thuê không tồn tại: ${tenantId}`);
  }
  const room = getRoom(roomId);
  if (!room) {
    throw new Error(`Phòng không tồn tại: ${roomId}`);
  }
  if (room.status === 'maintenance') {
    throw new Error(`Phòng ${room.roomNumber} đang bảo trì, không thể nhận người thuê`);
  }
  if (room.tenantId && room.tenantId !== tenantId) {
    throw new Error(`Phòng ${room.roomNumber} đã có người thuê`);
  }
  // Đang thuê phòng khác thì giải phóng phòng cũ trước
  if (tenant.active && tenant.roomId !== roomId) {
    const oldRoom = getRoom(tenant.roomId);
    if (oldRoom && oldRoom.tenantId === tenantId) {
      updateRoom(oldRoom.id, { tenantId: undefined, status: 'available' });
    }
  }
  const updated = updateTenant(tenantId, {
    active: true,
    roomId,
    moveInDate: options?.moveInDate ?? new Date(),
    moveOutDate: undefined,
    ...(options?.deposit !== undefined ? { deposit: options.deposit } : {}),
  })!;
  updateRoom(roomId, { tenantId, status: 'occupied' });
  return updated;
}

export function endTenancy(id: string, moveOutDate: Date = new Date()): Tenant | undefined {
  const tenant = getTenant(id);
  if (!tenant) return undefined;
  const updated = updateTenant(id, { active: false, moveOutDate });
  const room = getRoom(tenant.roomId);
  if (room && room.tenantId === id) {
    updateRoom(room.id, { tenantId: undefined, status: 'available' });
  }
  return updated;
}

export function deleteTenant(id: string): boolean {
  const db = getDatabase();
  const tenant = getTenant(id);
  if (!tenant) return false;
  const bills = db.prepare('SELECT COUNT(*) AS total FROM bills WHERE tenantId = ?').get(id) as { total: number };
  if (bills.total > 0) {
    throw new Error('Không thể xóa người thuê vì còn hóa đơn liên quan');
  }
  if (tenant.active) {
    const room = getRoom(tenant.roomId);
    if (room && room.tenantId === id) {
      updateRoom(room.id, { tenantId: undefined, status: 'available' });
    }
  }
  const result = db.prepare('DELETE FROM tenants WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Thống kê theo người thuê (gồm cả người đã trả phòng): tổng hóa đơn,
 * đã thanh toán, còn nợ. Người thuê đang ở xếp trước.
 */
export function getTenantSummaries(): TenantSummary[] {
  const db = getDatabase();
  const roomRows = db.prepare('SELECT id, roomNumber FROM rooms').all() as unknown as {
    id: string;
    roomNumber: string;
  }[];
  const roomNumberById = new Map(roomRows.map(r => [r.id, r.roomNumber]));

  interface AggRow {
    tenantId: string;
    billCount: number;
    totalBilled: number;
    totalPaid: number;
  }
  const aggRows = db
    .prepare(
      `SELECT tenantId,
              COUNT(*) AS billCount,
              SUM(totalAmount) AS totalBilled,
              SUM(CASE WHEN paid = 1 THEN totalAmount ELSE 0 END) AS totalPaid
       FROM bills
       GROUP BY tenantId`
    )
    .all() as unknown as AggRow[];
  const aggByTenant = new Map(aggRows.map(r => [r.tenantId, r]));

  return getAllTenants()
    .map(tenant => {
      const agg = aggByTenant.get(tenant.id);
      const totalBilled = agg?.totalBilled ?? 0;
      const totalPaid = agg?.totalPaid ?? 0;
      return {
        tenant,
        roomNumber: roomNumberById.get(tenant.roomId) ?? null,
        billCount: agg?.billCount ?? 0,
        totalBilled,
        totalPaid,
        totalUnpaid: totalBilled - totalPaid,
      };
    })
    .sort((a, b) => Number(b.tenant.active) - Number(a.tenant.active) || a.tenant.name.localeCompare(b.tenant.name));
}

export function getTenantsByRoom(roomId: string): Tenant[] {
  const rows = getDatabase()
    .prepare('SELECT * FROM tenants WHERE roomId = ? AND active = 1')
    .all(roomId) as unknown as TenantRow[];
  return rows.map(rowToTenant);
}
