import { describe, it } from 'node:test';
import assert from 'node:assert';
import { initDatabase } from '../src/db/database.js';
import {
  addMeterReading,
  updateMeterReading,
  getMeterReadingByMonth,
  calculateBill,
  getBillsByRoom,
  markBillAsPaid,
  applyLateFee,
  getBillingConfig,
  updateBillingConfig,
  getEffectiveRatesForRoom,
  createNewMonth,
  addExtraFee,
  deleteExtraFee,
  getExtraFees,
} from '../src/modules/billing/index.js';
import { createRoom, updateRoom } from '../src/modules/rooms/index.js';
import { createTenant } from '../src/modules/tenants/index.js';
import { Room, Tenant } from '../src/types/index.js';

initDatabase(':memory:');

let roomCounter = 300;
function makeRoomAndTenant(monthlyRent = 3000000): { room: Room; tenant: Tenant } {
  const room = createRoom({
    roomNumber: String(roomCounter++),
    floor: 3,
    area: 25,
    monthlyRent,
    status: 'available',
  });
  const tenant = createTenant({
    name: `Tenant ${room.roomNumber}`,
    phoneNumber: '0901234567',
    idCardNumber: '123456789',
    roomId: room.id,
    moveInDate: new Date('2026-01-01'),
    deposit: monthlyRent,
    active: true,
  });
  return { room, tenant };
}

describe('Billing Management', () => {
  it('should add meter reading', () => {
    const { room } = makeRoomAndTenant();
    const reading = addMeterReading({
      roomId: room.id,
      month: 5,
      year: 2026,
      electricOld: 1000,
      electricNew: 1150,
      waterOld: 20,
      waterNew: 30,
      readingDate: new Date(),
    });
    assert.ok(reading.id);
    assert.strictEqual(reading.electricNew - reading.electricOld, 150);
  });

  it('should reject reading for non-existent room', () => {
    assert.throws(
      () =>
        addMeterReading({
          roomId: 'khong-ton-tai',
          month: 5,
          year: 2026,
          electricOld: 0,
          electricNew: 10,
          waterOld: 0,
          waterNew: 1,
          readingDate: new Date(),
        }),
      /Phòng không tồn tại/
    );
  });

  it('should reject reading with new index lower than old index', () => {
    const { room } = makeRoomAndTenant();
    assert.throws(
      () =>
        addMeterReading({
          roomId: room.id,
          month: 5,
          year: 2026,
          electricOld: 1000,
          electricNew: 900,
          waterOld: 20,
          waterNew: 30,
          readingDate: new Date(),
        }),
      /Chỉ số điện mới/
    );
  });

  it('should reject duplicate reading for same room and month', () => {
    const { room } = makeRoomAndTenant();
    const data = {
      roomId: room.id,
      month: 6,
      year: 2026,
      electricOld: 100,
      electricNew: 200,
      waterOld: 10,
      waterNew: 15,
      readingDate: new Date(),
    };
    addMeterReading(data);
    assert.throws(() => addMeterReading(data), /Đã có chỉ số/);
  });

  it('should calculate bill including room rent', () => {
    const { room, tenant } = makeRoomAndTenant(3500000);
    addMeterReading({
      roomId: room.id,
      month: 5,
      year: 2026,
      electricOld: 1000,
      electricNew: 1150,
      waterOld: 20,
      waterNew: 30,
      readingDate: new Date(),
    });
    const bill = calculateBill(room.id, tenant.id, 5, 2026);
    assert.ok(bill);
    assert.strictEqual(bill.electricUsage, 150);
    assert.strictEqual(bill.waterUsage, 10);
    assert.strictEqual(bill.roomRent, 3500000);
    assert.strictEqual(bill.electricCost, 150 * bill.electricRate);
    assert.strictEqual(bill.waterCost, 10 * bill.waterRate);
    assert.strictEqual(bill.totalAmount, bill.electricCost + bill.waterCost + bill.roomRent);
  });

  it('should return null when no meter reading exists', () => {
    const { room, tenant } = makeRoomAndTenant();
    assert.strictEqual(calculateBill(room.id, tenant.id, 1, 2026), null);
  });

  it('should reject duplicate bill for same room and month', () => {
    const { room, tenant } = makeRoomAndTenant();
    addMeterReading({
      roomId: room.id,
      month: 5,
      year: 2026,
      electricOld: 100,
      electricNew: 150,
      waterOld: 10,
      waterNew: 12,
      readingDate: new Date(),
    });
    calculateBill(room.id, tenant.id, 5, 2026);
    assert.throws(() => calculateBill(room.id, tenant.id, 5, 2026), /Đã có hóa đơn/);
  });

  it('should mark bill as paid', () => {
    const { room, tenant } = makeRoomAndTenant();
    addMeterReading({
      roomId: room.id,
      month: 5,
      year: 2026,
      electricOld: 500,
      electricNew: 620,
      waterOld: 15,
      waterNew: 23,
      readingDate: new Date(),
    });
    const bill = calculateBill(room.id, tenant.id, 5, 2026);
    assert.ok(bill);
    assert.strictEqual(bill.paid, false);
    const paid = markBillAsPaid(bill.id);
    assert.ok(paid);
    assert.strictEqual(paid?.paid, true);
    assert.ok(paid?.paidDate);
    assert.strictEqual(getBillsByRoom(room.id)[0]?.paid, true);
  });

  it('should apply late fee once and reject after payment', () => {
    const { room, tenant } = makeRoomAndTenant(2000000);
    addMeterReading({
      roomId: room.id,
      month: 7,
      year: 2026,
      electricOld: 0,
      electricNew: 100,
      waterOld: 0,
      waterNew: 10,
      readingDate: new Date(),
    });
    const bill = calculateBill(room.id, tenant.id, 7, 2026);
    assert.ok(bill);
    const { lateFeeRate } = getBillingConfig();
    const withFee = applyLateFee(bill.id);
    assert.ok(withFee);
    assert.strictEqual(withFee.lateFee, Math.round(bill.totalAmount * lateFeeRate));
    assert.strictEqual(withFee.totalAmount, bill.totalAmount + withFee.lateFee);
    assert.throws(() => applyLateFee(bill.id), /đã được áp phí/);
    markBillAsPaid(bill.id);
    assert.throws(() => applyLateFee(bill.id), /đã thanh toán/);
  });

  it('should use per-room rates when set, falling back to default config', () => {
    // Phòng có giá riêng
    const room = createRoom({
      roomNumber: String(roomCounter++),
      floor: 3,
      area: 25,
      monthlyRent: 1000000,
      electricRate: 4200,
      waterRate: 60000,
      status: 'available',
    });
    const tenant = createTenant({
      name: `Tenant ${room.roomNumber}`,
      phoneNumber: '0901234567',
      idCardNumber: '123456789',
      roomId: room.id,
      moveInDate: new Date('2026-01-01'),
      deposit: 1000000,
      active: true,
    });
    const effective = getEffectiveRatesForRoom(room.id);
    assert.strictEqual(effective.electricRate, 4200);
    assert.strictEqual(effective.waterRate, 60000);
    assert.strictEqual(effective.source, 'room');

    // Phòng không có giá riêng → giá mặc định
    const { room: plainRoom } = makeRoomAndTenant();
    const fallback = getEffectiveRatesForRoom(plainRoom.id);
    assert.strictEqual(fallback.electricRate, getBillingConfig().electricRate);
    assert.strictEqual(fallback.source, 'default');

    addMeterReading({
      roomId: room.id,
      month: 8,
      year: 2026,
      electricOld: 0,
      electricNew: 100,
      waterOld: 0,
      waterNew: 10,
      readingDate: new Date(),
    });
    const bill = calculateBill(room.id, tenant.id, 8, 2026);
    assert.ok(bill);
    assert.strictEqual(bill.electricRate, 4200);
    assert.strictEqual(bill.electricCost, 100 * 4200);
    assert.strictEqual(bill.waterCost, 10 * 60000);
  });

  it('should update and clear per-room rates', () => {
    const { room } = makeRoomAndTenant();
    updateRoom(room.id, { electricRate: 5000 });
    assert.strictEqual(getEffectiveRatesForRoom(room.id).electricRate, 5000);
    // Xóa giá riêng bằng null → quay về giá mặc định
    updateRoom(room.id, { electricRate: null as unknown as undefined });
    assert.strictEqual(getEffectiveRatesForRoom(room.id).electricRate, getBillingConfig().electricRate);
    assert.throws(() => updateRoom(room.id, { electricRate: -1 }), /lớn hơn 0/);
  });

  it('should update a meter reading and reject when bill exists', () => {
    const { room, tenant } = makeRoomAndTenant();
    const reading = addMeterReading({
      roomId: room.id,
      month: 9,
      year: 2026,
      electricOld: 100,
      electricNew: 100,
      waterOld: 10,
      waterNew: 10,
      readingDate: new Date(),
    });
    const updated = updateMeterReading(reading.id, { electricNew: 250, waterNew: 18 });
    assert.ok(updated);
    assert.strictEqual(updated.electricNew, 250);
    assert.throws(() => updateMeterReading(reading.id, { electricNew: 50 }), /không được nhỏ hơn/);

    calculateBill(room.id, tenant.id, 9, 2026);
    assert.throws(() => updateMeterReading(reading.id, { electricNew: 300 }), /đã có hóa đơn/);
  });

  it('should create a new month carrying over previous readings', () => {
    const { room } = makeRoomAndTenant();
    const { room: roomNoPrev } = makeRoomAndTenant();
    addMeterReading({
      roomId: room.id,
      month: 10,
      year: 2026,
      electricOld: 500,
      electricNew: 640,
      waterOld: 30,
      waterNew: 38,
      readingDate: new Date(),
    });

    const result = createNewMonth(11, 2026);
    assert.ok(result.carried >= 1);

    const carriedReading = getMeterReadingByMonth(room.id, 11, 2026);
    assert.ok(carriedReading);
    assert.strictEqual(carriedReading.electricOld, 640);
    assert.strictEqual(carriedReading.electricNew, 640);
    assert.strictEqual(carriedReading.waterOld, 38);

    assert.strictEqual(getMeterReadingByMonth(roomNoPrev.id, 11, 2026), undefined);

    const again = createNewMonth(11, 2026);
    assert.strictEqual(again.carried, 0);
    assert.ok(again.skippedExisting >= 1);
  });

  it('should record which month the rent covers based on room setting', () => {
    // Phòng thu tiền phòng của chính tháng đó (mặc định)
    const { room: roomSame, tenant: tenantSame } = makeRoomAndTenant();
    addMeterReading({
      roomId: roomSame.id, month: 6, year: 2026,
      electricOld: 0, electricNew: 10, waterOld: 0, waterNew: 1,
      readingDate: new Date(),
    });
    const billSame = calculateBill(roomSame.id, tenantSame.id, 6, 2026)!;
    assert.strictEqual(billSame.rentMonth, 6);
    assert.strictEqual(billSame.rentYear, 2026);

    // Phòng thu trước tiền phòng tháng sau — kỳ 12 thì tiền phòng là của 1 năm sau
    const roomAhead = createRoom({
      roomNumber: String(roomCounter++), floor: 3, area: 25,
      monthlyRent: 2000000, rentMonthOffset: 1, status: 'available',
    });
    const tenantAhead = createTenant({
      name: `Tenant ${roomAhead.roomNumber}`, phoneNumber: '0901234567', idCardNumber: '123',
      roomId: roomAhead.id, moveInDate: new Date('2026-01-01'), deposit: 2000000, active: true,
    });
    addMeterReading({
      roomId: roomAhead.id, month: 12, year: 2026,
      electricOld: 0, electricNew: 10, waterOld: 0, waterNew: 1,
      readingDate: new Date(),
    });
    const billAhead = calculateBill(roomAhead.id, tenantAhead.id, 12, 2026)!;
    assert.strictEqual(billAhead.rentMonth, 1);
    assert.strictEqual(billAhead.rentYear, 2027);

    // Offset không hợp lệ bị chặn
    assert.throws(() => updateRoom(roomAhead.id, { rentMonthOffset: 5 }), /không hợp lệ/);
  });

  it('should include extra fees in the bill and lock them after billing', () => {
    const { room, tenant } = makeRoomAndTenant(2000000);
    addExtraFee({ roomId: room.id, month: 12, year: 2026, name: 'Tiền rác', amount: 30000 });
    const wifi = addExtraFee({ roomId: room.id, month: 12, year: 2026, name: 'Internet', amount: 100000 });
    assert.strictEqual(getExtraFees(room.id, 12, 2026).length, 2);

    assert.throws(() => addExtraFee({ roomId: room.id, month: 12, year: 2026, name: '  ', amount: 1 }), /để trống/);
    assert.throws(() => addExtraFee({ roomId: room.id, month: 12, year: 2026, name: 'X', amount: 0 }), /không hợp lệ/);

    addMeterReading({
      roomId: room.id,
      month: 12,
      year: 2026,
      electricOld: 0,
      electricNew: 100,
      waterOld: 0,
      waterNew: 10,
      readingDate: new Date(),
    });
    const bill = calculateBill(room.id, tenant.id, 12, 2026);
    assert.ok(bill);
    assert.strictEqual(bill.extraFees, 130000);
    assert.strictEqual(
      bill.totalAmount,
      bill.electricCost + bill.waterCost + bill.roomRent + 130000
    );

    // Sau khi có hóa đơn: không thêm/xóa phí được nữa
    assert.throws(() => addExtraFee({ roomId: room.id, month: 12, year: 2026, name: 'Trễ', amount: 1000 }), /đã có hóa đơn/);
    assert.throws(() => deleteExtraFee(wifi.id), /đã có hóa đơn/);
  });

  it('should persist billing config updates', () => {
    const original = getBillingConfig();
    const updated = updateBillingConfig({ electricRate: 4000 });
    assert.strictEqual(updated.electricRate, 4000);
    assert.strictEqual(updated.waterRate, original.waterRate);
    assert.strictEqual(getBillingConfig().electricRate, 4000);
    updateBillingConfig({ electricRate: original.electricRate });
  });
});
