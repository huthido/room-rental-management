import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import {
  createRoom,
  getRoom,
  getAllRooms,
  getRoomsByStatus,
  updateRoom,
  deleteRoom,
} from '../modules/rooms/index.js';
import {
  createTenant,
  getTenant,
  getAllTenants,
  getTenantSummaries,
  updateTenant,
  deleteTenant,
  endTenancy,
  assignTenantToRoom,
} from '../modules/tenants/index.js';
import {
  addMeterReading,
  updateMeterReading,
  getMeterReadingByMonth,
  getEffectiveRatesForRoom,
  createNewMonth,
  getBillsByTenant,
  deleteBill,
  addExtraFee,
  deleteExtraFee,
  getExtraFees,
  getExtraFeesByPeriod,
  calculateBill,
  getBill,
  getAllBills,
  getBillsByRoom,
  getBillsByMonth,
  markBillAsPaid,
  applyLateFee,
  getBillingConfig,
  updateBillingConfig,
} from '../modules/billing/index.js';
import { Room } from '../types/index.js';
import { login, verifyToken } from '../auth/auth.js';

type Body = Record<string, unknown>;

interface RouteContext {
  params: Record<string, string>;
  query: URLSearchParams;
  body: Body;
}

interface Route {
  method: string;
  segments: string[];
  status: number;
  handler: (ctx: RouteContext) => unknown;
}

class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

function asDate(value: unknown, field: string, fallback?: Date): Date {
  if (value === undefined || value === null) {
    if (fallback) return fallback;
    throw new HttpError(400, `Thiếu trường bắt buộc: ${field}`);
  }
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `Giá trị ngày không hợp lệ ở trường: ${field}`);
  }
  return date;
}

function notFound(): never {
  throw new HttpError(404, 'Không tìm thấy tài nguyên');
}

const routes: Route[] = [];

function route(method: string, path: string, handler: (ctx: RouteContext) => unknown, status = 200): void {
  routes.push({ method, segments: path.split('/').filter(Boolean), status, handler });
}

// --- Rooms ---
route('GET', '/api/rooms', ({ query }) => {
  const status = query.get('status');
  return status ? getRoomsByStatus(status as Room['status']) : getAllRooms();
});
route('GET', '/api/rooms/:id', ({ params }) => getRoom(params.id) ?? notFound());
function optionalNumber(value: unknown): number | undefined {
  return value === undefined || value === null || value === '' ? undefined : Number(value);
}

route(
  'POST',
  '/api/rooms',
  ({ body }) =>
    createRoom({
      roomNumber: String(body.roomNumber ?? ''),
      floor: Number(body.floor ?? 0),
      area: Number(body.area ?? 0),
      monthlyRent: Number(body.monthlyRent ?? 0),
      electricRate: optionalNumber(body.electricRate),
      waterRate: optionalNumber(body.waterRate),
      rentMonthOffset: optionalNumber(body.rentMonthOffset) ?? 0,
      status: (body.status as Room['status']) ?? 'available',
    }),
  201
);
route('GET', '/api/rooms/:id/rates', ({ params }) => {
  if (!getRoom(params.id)) notFound();
  return getEffectiveRatesForRoom(params.id);
});
route('PATCH', '/api/rooms/:id', ({ params, body }) => updateRoom(params.id, body) ?? notFound());
route('DELETE', '/api/rooms/:id', ({ params }) => {
  if (!deleteRoom(params.id)) notFound();
  return { deleted: true };
});

// --- Tenants ---
route('GET', '/api/tenants', () => getAllTenants());
// Đăng ký trước /api/tenants/:id để "stats" không bị hiểu nhầm là :id
route('GET', '/api/tenants/stats', () => getTenantSummaries());
route('GET', '/api/tenants/:id/bills', ({ params }) => {
  if (!getTenant(params.id)) notFound();
  return getBillsByTenant(params.id);
});
route('GET', '/api/tenants/:id', ({ params }) => getTenant(params.id) ?? notFound());
route(
  'POST',
  '/api/tenants',
  ({ body }) =>
    createTenant({
      name: String(body.name ?? ''),
      phoneNumber: String(body.phoneNumber ?? ''),
      idCardNumber: String(body.idCardNumber ?? ''),
      roomId: String(body.roomId ?? ''),
      moveInDate: asDate(body.moveInDate, 'moveInDate', new Date()),
      deposit: Number(body.deposit ?? 0),
      active: body.active === undefined ? true : Boolean(body.active),
    }),
  201
);
route('PATCH', '/api/tenants/:id', ({ params, body }) => {
  const data: Body = { ...body };
  if (body.moveInDate !== undefined) data.moveInDate = asDate(body.moveInDate, 'moveInDate');
  if (body.moveOutDate !== undefined) data.moveOutDate = asDate(body.moveOutDate, 'moveOutDate');
  return updateTenant(params.id, data) ?? notFound();
});
route('POST', '/api/tenants/:id/assign-room', ({ params, body }) =>
  assignTenantToRoom(params.id, String(body.roomId ?? ''), {
    moveInDate: body.moveInDate ? asDate(body.moveInDate, 'moveInDate') : undefined,
    deposit: body.deposit !== undefined ? Number(body.deposit) : undefined,
  })
);
route('POST', '/api/tenants/:id/end-tenancy', ({ params, body }) => {
  const moveOutDate = body.moveOutDate ? asDate(body.moveOutDate, 'moveOutDate') : new Date();
  return endTenancy(params.id, moveOutDate) ?? notFound();
});
route('DELETE', '/api/tenants/:id', ({ params }) => {
  if (!deleteTenant(params.id)) notFound();
  return { deleted: true };
});

// --- Meter readings ---
route(
  'POST',
  '/api/readings',
  ({ body }) =>
    addMeterReading({
      roomId: String(body.roomId ?? ''),
      month: Number(body.month ?? 0),
      year: Number(body.year ?? 0),
      electricOld: Number(body.electricOld ?? 0),
      electricNew: Number(body.electricNew ?? 0),
      waterOld: Number(body.waterOld ?? 0),
      waterNew: Number(body.waterNew ?? 0),
      readingDate: asDate(body.readingDate, 'readingDate', new Date()),
    }),
  201
);
route('GET', '/api/readings/:roomId/:year/:month', ({ params }) => {
  return getMeterReadingByMonth(params.roomId, Number(params.month), Number(params.year)) ?? notFound();
});
route('PATCH', '/api/readings/:id', ({ params, body }) => {
  const data: Record<string, unknown> = {};
  for (const field of ['electricOld', 'electricNew', 'waterOld', 'waterNew'] as const) {
    if (body[field] !== undefined) data[field] = Number(body[field]);
  }
  if (body.readingDate !== undefined) data.readingDate = asDate(body.readingDate, 'readingDate');
  return updateMeterReading(params.id, data) ?? notFound();
});

// --- Extra fees ---
route('GET', '/api/fees', ({ query }) => {
  const month = Number(query.get('month'));
  const year = Number(query.get('year'));
  if (!month || !year) {
    throw new HttpError(400, 'Thiếu tham số month/year');
  }
  const roomId = query.get('roomId');
  return roomId ? getExtraFees(roomId, month, year) : getExtraFeesByPeriod(month, year);
});
route(
  'POST',
  '/api/fees',
  ({ body }) =>
    addExtraFee({
      roomId: String(body.roomId ?? ''),
      month: Number(body.month ?? 0),
      year: Number(body.year ?? 0),
      name: String(body.name ?? ''),
      amount: Number(body.amount ?? 0),
    }),
  201
);
route('DELETE', '/api/fees/:id', ({ params }) => {
  if (!deleteExtraFee(params.id)) notFound();
  return { deleted: true };
});

// --- Periods ---
route('POST', '/api/periods', ({ body }) => createNewMonth(Number(body.month ?? 0), Number(body.year ?? 0)), 201);

// --- Bills ---
route(
  'POST',
  '/api/bills/calculate',
  ({ body }) => {
    const bill = calculateBill(
      String(body.roomId ?? ''),
      String(body.tenantId ?? ''),
      Number(body.month ?? 0),
      Number(body.year ?? 0)
    );
    if (!bill) {
      throw new HttpError(400, 'Chưa có chỉ số điện nước cho phòng này trong tháng yêu cầu');
    }
    return bill;
  },
  201
);
route('GET', '/api/bills', ({ query }) => {
  const roomId = query.get('roomId');
  if (roomId) return getBillsByRoom(roomId);
  const month = query.get('month');
  const year = query.get('year');
  if (month && year) return getBillsByMonth(Number(month), Number(year));
  return getAllBills();
});
route('GET', '/api/bills/:id', ({ params }) => getBill(params.id) ?? notFound());
route('POST', '/api/bills/:id/pay', ({ params, body }) => {
  const paidDate = body.paidDate ? asDate(body.paidDate, 'paidDate') : new Date();
  return markBillAsPaid(params.id, paidDate) ?? notFound();
});
route('POST', '/api/bills/:id/late-fee', ({ params }) => applyLateFee(params.id) ?? notFound());
route('DELETE', '/api/bills/:id', ({ params }) => {
  if (!deleteBill(params.id)) notFound();
  return { deleted: true };
});

// --- Config ---
route('GET', '/api/config', () => getBillingConfig());
route('PATCH', '/api/config', ({ body }) => updateBillingConfig(body));

// --- Health check (cho Coolify/Docker) ---
route('GET', '/api/health', () => ({ status: 'ok' }));

// --- Auth ---
route('POST', '/api/auth/login', ({ body }) => {
  const token = login(String(body.username ?? ''), String(body.password ?? ''));
  if (!token) {
    throw new HttpError(401, 'Sai tên đăng nhập hoặc mật khẩu');
  }
  return { token };
});
// Đến được đây nghĩa là token hợp lệ (đã qua kiểm tra ở handler)
route('GET', '/api/auth/me', () => ({ ok: true }));

/** Các endpoint không cần đăng nhập */
const PUBLIC_PATHS = new Set(['/api/health', '/api/auth/login']);

function matchRoute(method: string, pathSegments: string[]): { route: Route; params: Record<string, string> } | undefined {
  for (const r of routes) {
    if (r.method !== method || r.segments.length !== pathSegments.length) continue;
    const params: Record<string, string> = {};
    let matched = true;
    for (let i = 0; i < r.segments.length; i++) {
      const seg = r.segments[i];
      if (seg.startsWith(':')) {
        params[seg.slice(1)] = decodeURIComponent(pathSegments[i]);
      } else if (seg !== pathSegments[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return { route: r, params };
  }
  return undefined;
}

function errorStatus(err: unknown): number {
  if (err instanceof HttpError) return err.statusCode;
  if (err instanceof Error && /(đã tồn tại|đã có)/i.test(err.message)) return 409;
  return 400;
}

async function readBody(req: http.IncomingMessage): Promise<Body> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Body;
  } catch {
    throw new HttpError(400, 'JSON body không hợp lệ');
  }
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Phục vụ frontend build sẵn (SPA): file tồn tại thì trả file,
 * không thì fallback về index.html cho client-side routing.
 */
async function serveStatic(staticDir: string, pathname: string, res: http.ServerResponse): Promise<void> {
  let filePath = path.join(staticDir, decodeURIComponent(pathname));
  // Chống path traversal
  if (!path.resolve(filePath).startsWith(staticDir)) {
    filePath = path.join(staticDir, 'index.html');
  }
  try {
    let info = await stat(filePath).catch(() => null);
    if (!info || info.isDirectory()) {
      filePath = path.join(staticDir, 'index.html');
      info = await stat(filePath);
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
      'Content-Length': info.size,
      // Asset của Vite có hash trong tên — cache vĩnh viễn; còn lại không cache
      'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

export interface ApiServerOptions {
  /** Thư mục chứa frontend đã build (client/dist) — bỏ trống thì chỉ phục vụ API */
  staticDir?: string;
}

export function createApiServer(options: ApiServerOptions = {}): http.Server {
  const staticDir = options.staticDir ? path.resolve(options.staticDir) : undefined;
  return http.createServer(async (req, res) => {
    const sendJson = (status: number, payload: unknown): void => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payload));
    };
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      if (!url.pathname.startsWith('/api')) {
        if (staticDir && (req.method === 'GET' || req.method === 'HEAD')) {
          await serveStatic(staticDir, url.pathname, res);
          return;
        }
        sendJson(404, { error: 'Không tìm thấy endpoint' });
        return;
      }
      if (!PUBLIC_PATHS.has(url.pathname)) {
        const auth = req.headers.authorization ?? '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        if (!verifyToken(token)) {
          sendJson(401, { error: 'Chưa đăng nhập hoặc phiên đã hết hạn' });
          return;
        }
      }
      const match = matchRoute(req.method ?? 'GET', url.pathname.split('/').filter(Boolean));
      if (!match) {
        sendJson(404, { error: 'Không tìm thấy endpoint' });
        return;
      }
      const body = await readBody(req);
      const result = match.route.handler({ params: match.params, query: url.searchParams, body });
      sendJson(match.route.status, result);
    } catch (err) {
      sendJson(errorStatus(err), { error: err instanceof Error ? err.message : 'Lỗi không xác định' });
    }
  });
}
