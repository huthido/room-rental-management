import { describe, it } from 'node:test';
import assert from 'node:assert';
import { initDatabase } from '../src/db/database.js';
import { createRoom, getRoom } from '../src/modules/rooms/index.js';
import { createTenant, getTenant, endTenancy, deleteTenant, getTenantSummaries, assignTenantToRoom } from '../src/modules/tenants/index.js';
import { addMeterReading, updateMeterReading, calculateBill, markBillAsPaid, getBillsByTenant, deleteBill, getMeterReadingByMonth } from '../src/modules/billing/index.js';

initDatabase(':memory:');

function makeRoom(roomNumber: string, status: 'available' | 'occupied' | 'maintenance' = 'available') {
  return createRoom({ roomNumber, floor: 1, area: 25, monthlyRent: 3000000, status });
}

describe('Tenant Management', () => {
  it('should create a tenant and mark room as occupied', () => {
    const room = makeRoom('201');
    const tenant = createTenant({
      name: 'Nguyen Van A',
      phoneNumber: '0901234567',
      idCardNumber: '123456789',
      roomId: room.id,
      moveInDate: new Date('2026-01-01'),
      deposit: 3000000,
      active: true,
    });
    assert.ok(tenant.id);
    const updatedRoom = getRoom(room.id);
    assert.strictEqual(updatedRoom?.status, 'occupied');
    assert.strictEqual(updatedRoom?.tenantId, tenant.id);
  });

  it('should reject tenant for non-existent room', () => {
    assert.throws(
      () =>
        createTenant({
          name: 'Tran Thi B',
          phoneNumber: '0909876543',
          idCardNumber: '987654321',
          roomId: 'khong-ton-tai',
          moveInDate: new Date(),
          deposit: 1000000,
          active: true,
        }),
      /Phòng không tồn tại/
    );
  });

  it('should reject tenant for occupied room', () => {
    const room = makeRoom('202');
    createTenant({
      name: 'Nguoi Thu Nhat',
      phoneNumber: '0901111111',
      idCardNumber: '111111111',
      roomId: room.id,
      moveInDate: new Date(),
      deposit: 1000000,
      active: true,
    });
    assert.throws(
      () =>
        createTenant({
          name: 'Nguoi Thu Hai',
          phoneNumber: '0902222222',
          idCardNumber: '222222222',
          roomId: room.id,
          moveInDate: new Date(),
          deposit: 1000000,
          active: true,
        }),
      /đã có người thuê/
    );
  });

  it('should reject tenant for room under maintenance', () => {
    const room = makeRoom('203', 'maintenance');
    assert.throws(
      () =>
        createTenant({
          name: 'Le Van C',
          phoneNumber: '0903333333',
          idCardNumber: '333333333',
          roomId: room.id,
          moveInDate: new Date(),
          deposit: 1000000,
          active: true,
        }),
      /đang bảo trì/
    );
  });

  it('should free the room when tenancy ends', () => {
    const room = makeRoom('204');
    const tenant = createTenant({
      name: 'Pham Thi D',
      phoneNumber: '0904444444',
      idCardNumber: '444444444',
      roomId: room.id,
      moveInDate: new Date('2026-01-01'),
      deposit: 2000000,
      active: true,
    });
    const moveOutDate = new Date('2026-06-01');
    const ended = endTenancy(tenant.id, moveOutDate);
    assert.ok(ended);
    assert.strictEqual(ended?.active, false);
    assert.strictEqual(ended?.moveOutDate?.toISOString(), moveOutDate.toISOString());
    const freedRoom = getRoom(room.id);
    assert.strictEqual(freedRoom?.status, 'available');
    assert.strictEqual(freedRoom?.tenantId, undefined);
  });

  it('should keep former tenants in the list with per-tenant stats', () => {
    const room = makeRoom('206');
    const tenant = createTenant({
      name: 'Vu Van F',
      phoneNumber: '0906666666',
      idCardNumber: '666666666',
      roomId: room.id,
      moveInDate: new Date('2026-01-01'),
      deposit: 3000000,
      active: true,
    });
    addMeterReading({
      roomId: room.id,
      month: 3,
      year: 2026,
      electricOld: 0,
      electricNew: 100,
      waterOld: 0,
      waterNew: 10,
      readingDate: new Date(),
    });
    const bill1 = calculateBill(room.id, tenant.id, 3, 2026)!;
    markBillAsPaid(bill1.id);
    addMeterReading({
      roomId: room.id,
      month: 4,
      year: 2026,
      electricOld: 100,
      electricNew: 180,
      waterOld: 10,
      waterNew: 16,
      readingDate: new Date(),
    });
    const bill2 = calculateBill(room.id, tenant.id, 4, 2026)!;

    // Trả phòng — thông tin và lịch sử hóa đơn phải còn nguyên
    endTenancy(tenant.id, new Date('2026-05-01'));

    const summary = getTenantSummaries().find(s => s.tenant.id === tenant.id);
    assert.ok(summary, 'người thuê đã trả phòng vẫn phải có trong danh sách');
    assert.strictEqual(summary.tenant.active, false);
    assert.ok(summary.tenant.moveOutDate);
    assert.strictEqual(summary.roomNumber, '206');
    assert.strictEqual(summary.billCount, 2);
    assert.strictEqual(summary.totalBilled, bill1.totalAmount + bill2.totalAmount);
    assert.strictEqual(summary.totalPaid, bill1.totalAmount);
    assert.strictEqual(summary.totalUnpaid, bill2.totalAmount);

    const bills = getBillsByTenant(tenant.id);
    assert.strictEqual(bills.length, 2);
    assert.deepStrictEqual(bills.map(b => b.month), [3, 4]);
  });

  it('should re-assign a former tenant to a room', () => {
    const room1 = makeRoom('207');
    const room2 = makeRoom('208');
    const tenant = createTenant({
      name: 'Do Thi G',
      phoneNumber: '0907777777',
      idCardNumber: '777777777',
      roomId: room1.id,
      moveInDate: new Date('2026-01-01'),
      deposit: 2000000,
      active: true,
    });
    endTenancy(tenant.id, new Date('2026-03-01'));
    assert.strictEqual(getTenant(tenant.id)?.active, false);

    // Quay lại thuê phòng khác — kích hoạt lại hồ sơ cũ
    const back = assignTenantToRoom(tenant.id, room2.id, { moveInDate: new Date('2026-06-01'), deposit: 2500000 });
    assert.strictEqual(back.active, true);
    assert.strictEqual(back.roomId, room2.id);
    assert.strictEqual(back.moveOutDate, undefined);
    assert.strictEqual(back.deposit, 2500000);
    const occupiedRoom = getRoom(room2.id);
    assert.strictEqual(occupiedRoom?.status, 'occupied');
    assert.strictEqual(occupiedRoom?.tenantId, tenant.id);

    // Không gán được vào phòng đã có người
    const other = createTenant({
      name: 'Khac',
      phoneNumber: '0908888888',
      idCardNumber: '888888888',
      roomId: room1.id,
      moveInDate: new Date(),
      deposit: 1000000,
      active: true,
    });
    assert.throws(() => assignTenantToRoom(other.id, room2.id), /đã có người thuê/);
  });

  it('should unlock readings after a bill is cancelled', () => {
    const room = makeRoom('209');
    const tenant = createTenant({
      name: 'Bui Van H',
      phoneNumber: '0909999990',
      idCardNumber: '999999990',
      roomId: room.id,
      moveInDate: new Date('2026-01-01'),
      deposit: 2000000,
      active: true,
    });
    const reading = addMeterReading({
      roomId: room.id,
      month: 7,
      year: 2026,
      electricOld: 0,
      electricNew: 50,
      waterOld: 0,
      waterNew: 5,
      readingDate: new Date(),
    });
    const bill = calculateBill(room.id, tenant.id, 7, 2026)!;
    assert.throws(() => updateMeterReading(reading.id, { electricNew: 60 }), /đã có hóa đơn/);

    // Hủy hóa đơn -> sửa được chỉ số và tính lại
    assert.strictEqual(deleteBill(bill.id), true);
    const updated = updateMeterReading(reading.id, { electricNew: 60 });
    assert.strictEqual(updated?.electricNew, 60);
    const rebill = calculateBill(room.id, tenant.id, 7, 2026);
    assert.ok(rebill);
    assert.strictEqual(rebill.electricUsage, 60);
    assert.ok(getMeterReadingByMonth(room.id, 7, 2026));
    markBillAsPaid(rebill.id);
    assert.strictEqual(getBillsByTenant(tenant.id).length, 1);
  });

  it('should delete a tenant and free the room', () => {
    const room = makeRoom('205');
    const tenant = createTenant({
      name: 'Hoang Van E',
      phoneNumber: '0905555555',
      idCardNumber: '555555555',
      roomId: room.id,
      moveInDate: new Date(),
      deposit: 1500000,
      active: true,
    });
    assert.strictEqual(deleteTenant(tenant.id), true);
    assert.strictEqual(getTenant(tenant.id), undefined);
    assert.strictEqual(getRoom(room.id)?.status, 'available');
  });
});
