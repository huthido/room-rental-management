import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { initDatabase, closeDatabase } from '../src/db/database.js';
import { createApiServer } from '../src/api/server.js';

let server: http.Server;
let baseUrl: string;
let authToken = '';

before(async () => {
  initDatabase(':memory:');
  server = createApiServer();
  await new Promise<void>(resolve => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}/api`;
  // Đăng nhập bằng tài khoản mặc định (không đặt AUTH_USERNAME/AUTH_PASSWORD)
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' }),
  });
  authToken = ((await res.json()) as { token: string }).token;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close(err => (err ? reject(err) : resolve())));
  closeDatabase();
});

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

describe('REST API', () => {
  it('should require authentication', async () => {
    // Không có token -> 401
    const noToken = await fetch(`${baseUrl}/rooms`);
    assert.strictEqual(noToken.status, 401);
    // Token rác -> 401
    const badToken = await fetch(`${baseUrl}/rooms`, { headers: { Authorization: 'Bearer xxx.yyy' } });
    assert.strictEqual(badToken.status, 401);
    // Sai mật khẩu -> 401
    const badLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'sai-mat-khau' }),
    });
    assert.strictEqual(badLogin.status, 401);
    // Health không cần đăng nhập
    const health = await fetch(`${baseUrl}/health`);
    assert.strictEqual(health.status, 200);
    // Token hợp lệ -> /auth/me ok
    const me = await api('GET', '/auth/me');
    assert.strictEqual(me.status, 200);
  });

  it('should run the full rental flow over HTTP', async () => {
    const roomRes = await api('POST', '/rooms', {
      roomNumber: '501',
      floor: 5,
      area: 28,
      monthlyRent: 4000000,
    });
    assert.strictEqual(roomRes.status, 201);
    const roomId = roomRes.data.id;
    assert.ok(roomId);

    const getRes = await api('GET', `/rooms/${roomId}`);
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.data.roomNumber, '501');

    const tenantRes = await api('POST', '/tenants', {
      name: 'Nguyen Van API',
      phoneNumber: '0901234567',
      idCardNumber: '123456789012',
      roomId,
      moveInDate: '2026-01-01',
      deposit: 4000000,
    });
    assert.strictEqual(tenantRes.status, 201);
    const tenantId = tenantRes.data.id;

    const occupiedRoom = await api('GET', `/rooms/${roomId}`);
    assert.strictEqual(occupiedRoom.data.status, 'occupied');

    const readingRes = await api('POST', '/readings', {
      roomId,
      month: 5,
      year: 2026,
      electricOld: 1000,
      electricNew: 1100,
      waterOld: 10,
      waterNew: 20,
    });
    assert.strictEqual(readingRes.status, 201);

    const billRes = await api('POST', '/bills/calculate', { roomId, tenantId, month: 5, year: 2026 });
    assert.strictEqual(billRes.status, 201);
    assert.strictEqual(billRes.data.roomRent, 4000000);
    assert.strictEqual(
      billRes.data.totalAmount,
      billRes.data.electricCost + billRes.data.waterCost + billRes.data.roomRent
    );

    const payRes = await api('POST', `/bills/${billRes.data.id}/pay`);
    assert.strictEqual(payRes.status, 200);
    assert.strictEqual(payRes.data.paid, true);

    const billsRes = await api('GET', `/bills?roomId=${roomId}`);
    assert.strictEqual(billsRes.status, 200);
    assert.strictEqual(billsRes.data.length, 1);
  });

  it('should return 404 for unknown resources and endpoints', async () => {
    assert.strictEqual((await api('GET', '/rooms/khong-ton-tai')).status, 404);
    assert.strictEqual((await api('GET', '/khong-co-endpoint')).status, 404);
  });

  it('should return 400 for invalid data and 409 for duplicates', async () => {
    const roomRes = await api('POST', '/rooms', {
      roomNumber: '502',
      floor: 5,
      area: 20,
      monthlyRent: 3000000,
    });
    const dupRes = await api('POST', '/rooms', {
      roomNumber: '502',
      floor: 5,
      area: 20,
      monthlyRent: 3000000,
    });
    assert.strictEqual(dupRes.status, 409);
    assert.match(dupRes.data.error, /đã tồn tại/);

    const badReading = await api('POST', '/readings', {
      roomId: roomRes.data.id,
      month: 5,
      year: 2026,
      electricOld: 100,
      electricNew: 50,
      waterOld: 1,
      waterNew: 2,
    });
    assert.strictEqual(badReading.status, 400);
  });

  it('should read and update billing config', async () => {
    const configRes = await api('GET', '/config');
    assert.strictEqual(configRes.status, 200);
    assert.ok(configRes.data.electricRate > 0);

    const updateRes = await api('PATCH', '/config', { waterRate: 60000 });
    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.data.waterRate, 60000);
    assert.strictEqual((await api('GET', '/config')).data.waterRate, 60000);
  });
});
