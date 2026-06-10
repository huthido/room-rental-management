import { existsSync } from 'node:fs';
import { initDatabase } from './db/database.js';
import { createApiServer } from './api/server.js';
import { usingDefaultCredentials } from './auth/auth.js';

const dbPath = process.env.DB_PATH ?? 'data/rental.db';
const port = Number(process.env.PORT ?? 3000);

// Thư mục frontend đã build: ưu tiên CLIENT_DIR (Docker), fallback client/dist (local)
const clientDirCandidate = process.env.CLIENT_DIR ?? 'client/dist';
const staticDir = existsSync(clientDirCandidate) ? clientDirCandidate : undefined;

initDatabase(dbPath);

createApiServer({ staticDir }).listen(port, () => {
  console.log(`API server đang chạy tại http://localhost:${port}/api`);
  console.log(`Dữ liệu lưu tại: ${dbPath}`);
  if (staticDir) {
    console.log(`Giao diện web: http://localhost:${port} (phục vụ từ ${staticDir})`);
  } else {
    console.log('Không tìm thấy frontend build — chỉ phục vụ API (chạy "pnpm -C client build" nếu cần)');
  }
  if (usingDefaultCredentials) {
    console.warn('⚠ Đang dùng tài khoản mặc định admin/admin — đặt AUTH_USERNAME và AUTH_PASSWORD để đổi!');
  }
});
