import type {
  Room,
  RoomStatus,
  Tenant,
  MeterReading,
  MonthlyBill,
  BillingConfig,
  ExtraFee,
  NewMonthResult,
  TenantSummary,
} from './types';

export interface RoomFields {
  roomNumber: string;
  floor: number;
  area: number;
  monthlyRent: number;
  electricRate?: number | null;
  waterRate?: number | null;
  rentMonthOffset?: number;
  status: RoomStatus;
}

let authToken: string | null = localStorage.getItem('auth-token');
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
  if (token) localStorage.setItem('auth-token', token);
  else localStorage.removeItem('auth-token');
}

export function hasAuthToken(): boolean {
  return !!authToken;
}

/** Đăng ký callback khi phiên hết hạn / chưa đăng nhập (401) */
export function setOnUnauthorized(fn: () => void): void {
  onUnauthorized = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && path !== '/auth/login') {
    setAuthToken(null);
    onUnauthorized?.();
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `Lỗi HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<{ token: string }>('POST', '/auth/login', { username, password }),
    me: () => request<{ ok: boolean }>('GET', '/auth/me'),
  },
  rooms: {
    list: (status?: RoomStatus) =>
      request<Room[]>('GET', status ? `/rooms?status=${status}` : '/rooms'),
    create: (data: RoomFields) => request<Room>('POST', '/rooms', data),
    update: (id: string, data: Partial<RoomFields>) => request<Room>('PATCH', `/rooms/${id}`, data),
    remove: (id: string) => request<{ deleted: boolean }>('DELETE', `/rooms/${id}`),
  },
  tenants: {
    list: () => request<Tenant[]>('GET', '/tenants'),
    stats: () => request<TenantSummary[]>('GET', '/tenants/stats'),
    bills: (id: string) => request<MonthlyBill[]>('GET', `/tenants/${id}/bills`),
    create: (data: {
      name: string;
      phoneNumber: string;
      idCardNumber: string;
      roomId: string;
      moveInDate: string;
      deposit: number;
    }) => request<Tenant>('POST', '/tenants', data),
    update: (
      id: string,
      data: Partial<{ name: string; phoneNumber: string; idCardNumber: string; moveInDate: string; deposit: number }>
    ) => request<Tenant>('PATCH', `/tenants/${id}`, data),
    endTenancy: (id: string) => request<Tenant>('POST', `/tenants/${id}/end-tenancy`, {}),
    assignRoom: (id: string, data: { roomId: string; moveInDate?: string; deposit?: number }) =>
      request<Tenant>('POST', `/tenants/${id}/assign-room`, data),
    remove: (id: string) => request<{ deleted: boolean }>('DELETE', `/tenants/${id}`),
  },
  readings: {
    create: (data: {
      roomId: string;
      month: number;
      year: number;
      electricOld: number;
      electricNew: number;
      waterOld: number;
      waterNew: number;
    }) => request<MeterReading>('POST', '/readings', data),
    byMonth: (roomId: string, year: number, month: number) =>
      request<MeterReading>('GET', `/readings/${roomId}/${year}/${month}`),
    byPeriod: (month: number, year: number) =>
      request<MeterReading[]>('GET', `/readings?month=${month}&year=${year}`),
    update: (
      id: string,
      data: Partial<Pick<MeterReading, 'electricOld' | 'electricNew' | 'waterOld' | 'waterNew'>>
    ) => request<MeterReading>('PATCH', `/readings/${id}`, data),
  },
  fees: {
    byPeriod: (month: number, year: number) => request<ExtraFee[]>('GET', `/fees?month=${month}&year=${year}`),
    create: (data: { roomId: string; month: number; year: number; name: string; amount: number }) =>
      request<ExtraFee>('POST', '/fees', data),
    remove: (id: string) => request<{ deleted: boolean }>('DELETE', `/fees/${id}`),
  },
  periods: {
    create: (data: { month: number; year: number }) => request<NewMonthResult>('POST', '/periods', data),
  },
  bills: {
    list: (filter?: { roomId?: string; month?: number; year?: number }) => {
      const p = new URLSearchParams();
      if (filter?.roomId) p.set('roomId', filter.roomId);
      if (filter?.month != null) p.set('month', String(filter.month));
      if (filter?.year != null) p.set('year', String(filter.year));
      const qs = p.toString();
      return request<MonthlyBill[]>('GET', qs ? `/bills?${qs}` : '/bills');
    },
    calculate: (data: { roomId: string; tenantId: string; month: number; year: number }) =>
      request<MonthlyBill>('POST', '/bills/calculate', data),
    pay: (id: string) => request<MonthlyBill>('POST', `/bills/${id}/pay`, {}),
    applyLateFee: (id: string) => request<MonthlyBill>('POST', `/bills/${id}/late-fee`, {}),
    remove: (id: string) => request<{ deleted: boolean }>('DELETE', `/bills/${id}`),
  },
  config: {
    get: () => request<BillingConfig>('GET', '/config'),
    update: (data: Partial<BillingConfig>) => request<BillingConfig>('PATCH', '/config', data),
  },
};
