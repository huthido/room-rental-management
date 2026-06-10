# Quản lý nhà trọ

Hệ thống quản lý nhà trọ, tính tiền điện nước theo tháng — lưu trữ bền vững bằng **SQLite** (module `node:sqlite` built-in) và cung cấp **REST API** qua HTTP. Không có runtime dependency nào ngoài Node.js.

## Yêu cầu

- Node.js **>= 23.4** (cần `node:sqlite` built-in; khuyến nghị Node 24 LTS)

## Tính năng

- **Quản lý phòng trọ**: Thêm, sửa, xóa thông tin phòng (số phòng duy nhất, chặn xóa phòng còn dữ liệu liên quan)
- **Quản lý người thuê**: Gắn người thuê với phòng — tự động cập nhật trạng thái phòng, chặn thuê phòng đã có người hoặc đang bảo trì, trả phòng (`endTenancy`)
- **Ghi chỉ số điện nước**: Lưu chỉ số cũ/mới hàng tháng, chặn chỉ số âm và ghi trùng kỳ
- **Tính hóa đơn**: Tự động tính tiền điện + nước + **tiền phòng**, chặn tạo trùng hóa đơn cùng kỳ
- **Phí trễ hạn**: Áp phí trễ hạn (mặc định 5%) lên hóa đơn chưa thanh toán
- **Quản lý thanh toán**: Đánh dấu hóa đơn đã thanh toán
- **Lưu trữ SQLite**: Dữ liệu lưu vào file `.db`, không mất khi tắt chương trình
- **REST API**: Backend HTTP để gọi từ web/mobile

## Cài đặt & sử dụng

```bash
pnpm install            # Cài backend
pnpm -C client install  # Cài frontend

pnpm dev        # Chạy đồng thời: tsc watch + API server (:3000) + frontend Vite (:5173)
pnpm build      # Build TypeScript backend
pnpm test       # Chạy toàn bộ test (room, tenant, billing, API)
pnpm demo       # Chạy demo đầy đủ (tạo data/demo.db)
pnpm start      # Chỉ khởi động REST API server
```

Mở **http://localhost:5173** để dùng giao diện web (Vite proxy `/api` → backend `127.0.0.1:3000`).

### Cấu hình server

| Biến môi trường | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `3000` | Cổng HTTP |
| `DB_PATH` | `data/rental.db` | Đường dẫn file SQLite (`:memory:` để chạy không lưu file) |

## REST API

Tất cả endpoint trả về JSON, prefix `/api`. Lỗi trả về `{ "error": "..." }` với mã 400 (dữ liệu không hợp lệ), 404 (không tìm thấy), 409 (trùng lặp).

### Phòng

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/rooms` | Danh sách phòng (lọc: `?status=available\|occupied\|maintenance`) |
| GET | `/api/rooms/:id` | Chi tiết phòng |
| GET | `/api/rooms/:id/rates` | Đơn giá hiệu lực của phòng (`source: room` nếu có giá riêng, `default` nếu dùng giá mặc định) |
| POST | `/api/rooms` | Tạo phòng `{roomNumber, floor, area, monthlyRent, electricRate?, waterRate?, status?}` — `electricRate`/`waterRate` là **giá riêng của phòng**, bỏ trống dùng giá mặc định |
| PATCH | `/api/rooms/:id` | Cập nhật phòng (truyền `electricRate: null` để xóa giá riêng) |
| DELETE | `/api/rooms/:id` | Xóa phòng (chặn nếu còn dữ liệu liên quan) |

### Người thuê

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/tenants` | Danh sách người thuê |
| GET | `/api/tenants/:id` | Chi tiết người thuê |
| POST | `/api/tenants` | Tạo người thuê `{name, phoneNumber, idCardNumber, roomId, moveInDate?, deposit, active?}` — tự động đánh dấu phòng `occupied` |
| PATCH | `/api/tenants/:id` | Cập nhật người thuê |
| POST | `/api/tenants/:id/end-tenancy` | Trả phòng `{moveOutDate?}` — giải phóng phòng về `available` |
| DELETE | `/api/tenants/:id` | Xóa người thuê (chặn nếu còn hóa đơn) |

### Chỉ số điện nước

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/readings` | Ghi chỉ số `{roomId, month, year, electricOld, electricNew, waterOld, waterNew, readingDate?}` |
| GET | `/api/readings/:roomId/:year/:month` | Chỉ số của phòng theo kỳ |
| PATCH | `/api/readings/:id` | Sửa chỉ số (chặn nếu kỳ đã có hóa đơn) |

### Kỳ tính tiền

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/periods` | **Tạo tháng mới** `{month, year}` — với mỗi phòng đang thuê, tạo chỉ số kỳ mới với chỉ số cũ = chỉ số mới tháng trước; trả về `{carried, skippedNoPrev, skippedExisting}` |

### Hóa đơn

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/bills/calculate` | Tính hóa đơn `{roomId, tenantId, month, year}` — tổng = điện + nước + tiền phòng |
| GET | `/api/bills` | Danh sách hóa đơn (lọc: `?roomId=` hoặc `?month=&year=`) |
| GET | `/api/bills/:id` | Chi tiết hóa đơn |
| POST | `/api/bills/:id/pay` | Đánh dấu đã thanh toán `{paidDate?}` |
| POST | `/api/bills/:id/late-fee` | Áp phí trễ hạn (1 lần, chỉ với hóa đơn chưa thanh toán) |

### Cấu hình đơn giá

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/config` | Đơn giá hiện tại |
| PATCH | `/api/config` | Cập nhật `{electricRate?, waterRate?, lateFeeRate?}` (lưu bền vững trong DB) |

Mặc định: điện **3.500 VND/kWh**, nước **50.000 VND/m³**, phí trễ hạn **5%**. Khi tính hóa đơn, hệ thống ưu tiên **giá riêng của từng phòng** (`electricRate`/`waterRate` trên Room); phòng không có giá riêng thì dùng giá mặc định này.

## Ví dụ gọi API

```bash
# Tạo phòng
curl -X POST http://localhost:3000/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"roomNumber":"101","floor":1,"area":25,"monthlyRent":3000000}'

# Tạo người thuê (phòng tự chuyển sang occupied)
curl -X POST http://localhost:3000/api/tenants \
  -H "Content-Type: application/json" \
  -d '{"name":"Nguyễn Văn A","phoneNumber":"0901234567","idCardNumber":"123456789012","roomId":"<room-id>","deposit":3000000}'

# Ghi chỉ số + tính hóa đơn
curl -X POST http://localhost:3000/api/readings \
  -H "Content-Type: application/json" \
  -d '{"roomId":"<room-id>","month":6,"year":2026,"electricOld":1000,"electricNew":1150,"waterOld":20,"waterNew":30}'

curl -X POST http://localhost:3000/api/bills/calculate \
  -H "Content-Type: application/json" \
  -d '{"roomId":"<room-id>","tenantId":"<tenant-id>","month":6,"year":2026}'
```

## Dùng như thư viện

```typescript
import {
  initDatabase,
  createRoom, createTenant, addMeterReading,
  calculateBill, applyLateFee, markBillAsPaid,
} from './src/index.js';

initDatabase('data/rental.db'); // hoặc ':memory:'

const room = createRoom({ roomNumber: '101', floor: 1, area: 25, monthlyRent: 3000000, status: 'available' });
const tenant = createTenant({
  name: 'Nguyễn Văn A', phoneNumber: '0901234567', idCardNumber: '123456789012',
  roomId: room.id, moveInDate: new Date(), deposit: 3000000, active: true,
});
addMeterReading({
  roomId: room.id, month: 6, year: 2026,
  electricOld: 1000, electricNew: 1150, waterOld: 20, waterNew: 30,
  readingDate: new Date(),
});

const bill = calculateBill(room.id, tenant.id, 6, 2026);
// bill.totalAmount = tiền điện + tiền nước + tiền phòng
```

## Quy tắc nghiệp vụ (validation)

- Số phòng (`roomNumber`) là duy nhất
- Không tạo người thuê cho phòng không tồn tại, đang bảo trì, hoặc đã có người thuê
- Chỉ số điện/nước mới không được nhỏ hơn chỉ số cũ; tháng phải trong 1–12
- Mỗi phòng chỉ có 1 bản ghi chỉ số và 1 hóa đơn cho mỗi kỳ (tháng/năm)
- Hóa đơn gồm: tiền điện + tiền nước + tiền phòng (`monthlyRent`)
- Phí trễ hạn chỉ áp 1 lần và chỉ với hóa đơn chưa thanh toán
- Không xóa phòng/người thuê khi còn dữ liệu tham chiếu

## Cấu trúc dự án

```
room-rental-management/
├── src/
│   ├── db/
│   │   └── database.ts     # Lớp SQLite (node:sqlite): schema, init/get/close
│   ├── modules/
│   │   ├── rooms/          # Quản lý phòng trọ
│   │   ├── tenants/        # Quản lý người thuê
│   │   └── billing/        # Chỉ số điện nước + hóa đơn + đơn giá
│   ├── api/
│   │   └── server.ts       # REST API (node:http, zero dependency)
│   ├── types/              # TypeScript interfaces
│   ├── utils/              # Tiện ích ngày tháng, format tiền tệ
│   ├── index.ts            # Barrel export (dùng như thư viện)
│   ├── server.ts           # Entry point backend (npm start)
│   └── demo.ts             # Demo đầy đủ (npm run demo)
├── client/                 # Frontend React + Vite
│   └── src/
│       ├── api.ts          # API client (fetch, typed)
│       ├── types.ts        # Types khớp với backend
│       └── components/     # 5 trang: Phòng, Người thuê, Chỉ số, Hóa đơn, Đơn giá
├── tests/                  # node:test — room, tenant, billing, API
├── data/                   # File SQLite (gitignored)
├── package.json
└── tsconfig.json
```

## Deploy lên Coolify

Dự án có sẵn `Dockerfile` multi-stage (build backend + frontend, runtime chỉ cần Node — không có dependency nào khác). Server production tự phục vụ cả API lẫn giao diện web trên cùng một cổng.

### Các bước trên Coolify (khuyến nghị: Docker Compose)

1. **Tạo resource mới** → chọn repository Git của dự án
2. **Build Pack**: chọn **Docker Compose** (file `docker-compose.yaml` — đúng tên mặc định Coolify tìm) — volume bền vững `/app/data` cho SQLite và healthcheck **đã cấu hình sẵn**, không cần thêm gì
3. **Environment Variables**: đặt `AUTH_USERNAME`, `AUTH_PASSWORD`, `AUTH_SECRET` (compose tự nhận qua interpolation)
4. Deploy. Health check có sẵn tại `GET /api/health`

> **Nếu dùng Build Pack: Dockerfile** thay vì Compose: phải tự thêm **Persistent Storage** mount vào **`/app/data`** trong Coolify UI và đặt Port `3000` — chỉ thị `VOLUME` trong Dockerfile tạo anonymous volume, sẽ bị thay mới khi redeploy (mất dữ liệu) nếu không khai báo storage.

### Biến môi trường (tùy chọn)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `3000` | Cổng HTTP |
| `DB_PATH` | `/app/data/rental.db` | File SQLite (đặt trong volume) |
| `CLIENT_DIR` | `/app/public` | Thư mục frontend build (không cần đổi) |
| `AUTH_USERNAME` | `admin` | Tên đăng nhập — **bắt buộc đổi khi deploy thật** |
| `AUTH_PASSWORD` | `admin` | Mật khẩu — **bắt buộc đổi khi deploy thật** |
| `AUTH_SECRET` | ngẫu nhiên mỗi lần khởi động | Secret ký token đăng nhập (7 ngày) — đặt cố định để không phải đăng nhập lại sau mỗi restart |

### Đăng nhập

Toàn bộ API (trừ `/api/health`) yêu cầu đăng nhập. Giao diện web hiện màn hình đăng nhập khi truy cập; token lưu trình duyệt, hết hạn sau 7 ngày. Gọi API trực tiếp: `POST /api/auth/login {username, password}` → `{token}`, sau đó gửi header `Authorization: Bearer <token>`.

### Chạy thử bằng Docker local

```bash
docker compose up -d   # hoặc: docker build -t room-rental . && docker run -p 3000:3000 -v rental-data:/app/data room-rental
```

Mở http://localhost:3000 — cả giao diện lẫn API chạy trên cùng cổng.

## License

MIT
