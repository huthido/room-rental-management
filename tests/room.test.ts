import { describe, it } from 'node:test';
import assert from 'node:assert';
import { initDatabase } from '../src/db/database.js';
import { createRoom, getRoom, getAllRooms, updateRoom, deleteRoom, getRoomsByStatus } from '../src/modules/rooms/index.js';

initDatabase(':memory:');

describe('Room Management', () => {
  it('should create a new room', () => {
    const room = createRoom({
      roomNumber: '101',
      floor: 1,
      area: 25,
      monthlyRent: 3000000,
      status: 'available',
    });
    assert.ok(room.id);
    assert.strictEqual(room.roomNumber, '101');
    assert.strictEqual(room.status, 'available');
  });

  it('should reject duplicate room number', () => {
    createRoom({ roomNumber: '105', floor: 1, area: 20, monthlyRent: 2500000, status: 'available' });
    assert.throws(
      () => createRoom({ roomNumber: '105', floor: 1, area: 20, monthlyRent: 2500000, status: 'available' }),
      /đã tồn tại/
    );
  });

  it('should get a room by id', () => {
    const room = createRoom({
      roomNumber: '102',
      floor: 1,
      area: 30,
      monthlyRent: 3500000,
      status: 'available',
    });
    const found = getRoom(room.id);
    assert.ok(found);
    assert.strictEqual(found?.roomNumber, '102');
  });

  it('should update a room', () => {
    const room = createRoom({
      roomNumber: '103',
      floor: 2,
      area: 28,
      monthlyRent: 3200000,
      status: 'available',
    });
    const updated = updateRoom(room.id, { status: 'occupied' });
    assert.ok(updated);
    assert.strictEqual(updated?.status, 'occupied');
    assert.strictEqual(getRoom(room.id)?.status, 'occupied');
  });

  it('should delete a room', () => {
    const room = createRoom({
      roomNumber: '104',
      floor: 2,
      area: 22,
      monthlyRent: 2800000,
      status: 'available',
    });
    const result = deleteRoom(room.id);
    assert.strictEqual(result, true);
    assert.strictEqual(getRoom(room.id), undefined);
  });

  it('should filter rooms by status', () => {
    createRoom({ roomNumber: '106', floor: 1, area: 20, monthlyRent: 2500000, status: 'maintenance' });
    const maintenance = getRoomsByStatus('maintenance');
    assert.ok(maintenance.some(r => r.roomNumber === '106'));
    assert.ok(getAllRooms().length >= maintenance.length);
  });
});
