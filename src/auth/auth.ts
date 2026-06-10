import crypto from 'node:crypto';

/**
 * Đăng nhập đơn giản cho 1 tài khoản chủ trọ:
 * - Tài khoản/mật khẩu đặt qua AUTH_USERNAME / AUTH_PASSWORD (mặc định admin/admin)
 * - Token HMAC-SHA256 ký bằng AUTH_SECRET (không đặt thì sinh ngẫu nhiên mỗi lần
 *   khởi động — restart server sẽ phải đăng nhập lại)
 */
// Dùng || thay vì ?? để chuỗi rỗng (ví dụ AUTH_SECRET= trong compose) cũng tính là chưa đặt
const SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
const USERNAME = process.env.AUTH_USERNAME || 'admin';
const PASSWORD = process.env.AUTH_PASSWORD || 'admin';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày

export const usingDefaultCredentials = !process.env.AUTH_USERNAME && !process.env.AUTH_PASSWORD;

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

export function login(username: string, password: string): string | null {
  if (!safeEqual(username, USERNAME) || !safeEqual(password, PASSWORD)) {
    return null;
  }
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string): boolean {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(signature, sign(payload))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { exp?: number };
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}
