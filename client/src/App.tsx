import { useEffect, useState } from 'react';
import { Dashboard } from './Dashboard';
import { RoomModal } from './modals/AddRoomModal';
import { TenantModal } from './modals/AddTenantModal';
import { ConfigModal } from './modals/ConfigModal';
import { NewMonthModal } from './modals/NewMonthModal';
import { TenantListModal } from './modals/TenantListModal';
import { ConfirmHost } from './components/ConfirmHost';
import { LoginPage } from './LoginPage';
import { hasAuthToken, setAuthToken, setOnUnauthorized } from './api';
import { currentPeriod } from './format';
import type { Room, Tenant } from './types';

type ModalKind = 'room' | 'tenant' | 'tenant-list' | 'config' | 'new-month' | null;

function getInitialTheme(): 'light' | 'dark' {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialLayout(): 'table' | 'cards' {
  const saved = localStorage.getItem('layout');
  if (saved === 'table' || saved === 'cards') return saved;
  // Mặc định: màn hình nhỏ dùng thẻ dọc, màn hình lớn dùng bảng ngang
  return window.matchMedia('(max-width: 640px)').matches ? 'cards' : 'table';
}

export default function App() {
  const [authed, setAuthed] = useState(hasAuthToken);
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  const [layout, setLayout] = useState<'table' | 'cards'>(getInitialLayout);
  const [period, setPeriod] = useState(currentPeriod);
  const [modal, setModal] = useState<ModalKind>(null);
  const [modalRoom, setModalRoom] = useState<Room | null>(null);
  const [modalTenant, setModalTenant] = useState<Tenant | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.layout = layout;
    localStorage.setItem('layout', layout);
  }, [layout]);

  // Phiên hết hạn / token không hợp lệ -> quay về màn đăng nhập
  useEffect(() => {
    setOnUnauthorized(() => setAuthed(false));
  }, []);

  function logout() {
    setAuthToken(null);
    setAuthed(false);
  }

  const refresh = () => setRefreshKey(k => k + 1);
  const close = () => { setModal(null); setModalRoom(null); setModalTenant(null); };

  function openAddTenant(room?: Room) { setModalRoom(room ?? null); setModalTenant(null); setModal('tenant'); }
  function openEditTenant(tenant: Tenant) { setModalTenant(tenant); setModalRoom(null); setModal('tenant'); }
  function openRoom(room?: Room) { setModalRoom(room ?? null); setModal('room'); }

  if (!authed) {
    return <LoginPage onSuccess={() => setAuthed(true)} />;
  }

  return (
    <>
      <header className="app-header">
        <h1>Quản lý nhà trọ</h1>
        <div className="header-controls">
          <div className="period-select">
            <select
              value={period.month}
              onChange={e => setPeriod(p => ({ ...p, month: +e.target.value }))}
              aria-label="Tháng"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
            <input
              type="number"
              value={period.year}
              onChange={e => setPeriod(p => ({ ...p, year: +e.target.value }))}
              aria-label="Năm"
              className="year-input"
            />
          </div>
          <button className="btn btn-small btn-primary" onClick={() => setModal('new-month')} title="Tạo tháng mới">
            📅<span className="btn-label"> Tháng mới</span>
          </button>
          <button className="btn btn-small" onClick={() => openRoom()} title="Thêm phòng">
            🚪<span className="btn-label"> + Phòng</span>
          </button>
          <button className="btn btn-small" onClick={() => openAddTenant()} title="Thêm người thuê">
            👤<span className="btn-label"> + Người thuê</span>
          </button>
          <button className="btn btn-small" onClick={() => setModal('tenant-list')} title="Danh sách & thống kê người thuê (gồm cả người đã trả phòng)">
            👥<span className="btn-label"> Thống kê</span>
          </button>
          <button className="btn btn-small" onClick={() => setModal('config')} title="Đơn giá mặc định và phí trễ hạn">⚙</button>
          <button
            className="theme-toggle"
            onClick={() => setLayout(l => (l === 'table' ? 'cards' : 'table'))}
            title={layout === 'table' ? 'Chuyển sang danh sách thẻ dọc' : 'Chuyển sang bảng ngang'}
          >
            {layout === 'table' ? '☰' : '▦'}
          </button>
          <button
            className="theme-toggle"
            onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
            title={theme === 'dark' ? 'Chuyển giao diện sáng' : 'Chuyển giao diện tối'}
          >
            {theme === 'dark' ? '☀' : '🌙'}
          </button>
          <button className="theme-toggle" onClick={logout} title="Đăng xuất">
            ⏻
          </button>
        </div>
      </header>

      <Dashboard
        period={period}
        refreshKey={refreshKey}
        onRefresh={refresh}
        onAddTenant={openAddTenant}
        onEditRoom={openRoom}
        onEditTenant={openEditTenant}
      />

      {modal === 'room'   && <RoomModal room={modalRoom} onClose={close} onSuccess={refresh} />}
      {modal === 'tenant' && <TenantModal tenant={modalTenant} preselectedRoom={modalRoom} onClose={close} onSuccess={refresh} />}
      {modal === 'tenant-list' && <TenantListModal onClose={close} />}
      {modal === 'config'     && <ConfigModal onClose={close} />}
      <ConfirmHost />
      {modal === 'new-month'  && (
        <NewMonthModal
          basePeriod={period}
          onClose={() => { close(); refresh(); }}
          onGoToMonth={p => { setPeriod(p); close(); refresh(); }}
        />
      )}
    </>
  );
}
