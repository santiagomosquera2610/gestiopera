import type { AuthResponse, CashShift, CashShiftHistory, DashboardResponse, ExpensePaymentMethod, SaleResponse, InventoryMovementResponse, PhysicalCountResponse, Product, PurchaseResponse, ReportResponse, AuditLogResponse, EmployeeResponse, SessionDetail, SessionResult, Table, TableKind, NotificationResponse, NotificationPreferenceResponse, SaleDetailResponse } from './types'
import { useAuthStore } from './authStore'
import type { Branding } from './branding'

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:5080'

async function request<T>(path: string, init?: RequestInit, allowRefresh = true): Promise<T> {
  const token = useAuthStore.getState().auth?.accessToken
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers
    }
  })
  if (!response.ok) {
    if (response.status === 401 && token && allowRefresh) {
      const refreshed = await useAuthStore.getState().refresh()
      if (refreshed) return request(path, init, false)
    }
    const body = await response.json().catch(() => null) as { detail?: string; title?: string; errors?: Record<string, string[]> } | null
    const validationErrors = body?.errors ? Object.values(body.errors).flat().filter(Boolean) : []
    const reason = [body?.detail, ...validationErrors].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index).join(' ')
    throw new Error(reason || (response.status === 401 ? (token ? 'Tu sesión expiró. Inicia sesión nuevamente.' : 'El correo, la contraseña o el código del negocio no son válidos.') : `Error ${response.status}`))
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const login = (email: string, password: string) =>
  request<AuthResponse>('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ tenantSlug: null, email, password })
  })

export const getDashboard = () => request<DashboardResponse>('/api/dashboard')
export const getTenantBranding = () => request<Branding>('/api/tenants/branding')
export const updateTenantBranding = (value: Branding) => request<Branding>('/api/tenants/branding', { method: 'PUT', body: JSON.stringify(value) })
export const getTables = () => request<Table[]>('/api/billiards/tables')
export const createBilliardTable = (name: string, hourlyRate: number, billingIncrementMinutes: number, kind: TableKind = 'Billiard') => request<Table>('/api/billiards/tables', { method: 'POST', body: JSON.stringify({ name, hourlyRate, billingIncrementMinutes, kind }) })
export const updateBilliardTable = (id: string, value: { name: string; hourlyRate: number; billingIncrementMinutes: number }) => request<Table>('/api/billiards/tables/' + id, { method: 'PATCH', body: JSON.stringify(value) })
export const getProducts = () => request<Product[]>('/api/products')
export const getSession = (id: string) => request<SessionDetail>(`/api/billiards/sessions/${id}`)

export const startTable = (id: string) => request<SessionResult>(`/api/billiards/tables/${id}/start`, { method: 'POST' })
export const pauseTable = (id: string) => request<void>(`/api/billiards/tables/${id}/pause`, { method: 'POST' })
export const resumeTable = (id: string) => request<void>(`/api/billiards/tables/${id}/resume`, { method: 'POST' })

export const addConsumption = (sessionId: string, productId: string, quantity: number) => request<string>(`/api/billiards/sessions/${sessionId}/consumptions`, { method: 'POST', body: JSON.stringify({ productId, quantity }) })

export const updateConsumption = (sessionId: string, consumptionId: string, quantity: number) => request<void>(`/api/billiards/sessions/${sessionId}/consumptions/${consumptionId}`, { method: 'PATCH', body: JSON.stringify({ quantity }) })

export const deleteConsumption = (sessionId: string, consumptionId: string) => request<void>(`/api/billiards/sessions/${sessionId}/consumptions/${consumptionId}`, { method: 'DELETE' })


export const closeSession = (sessionId: string, amount: number, customerName: string) => request<SessionResult>(
  `/api/billiards/sessions/${sessionId}/close`, {
    method: 'POST',
    body: JSON.stringify({ customerName: customerName.trim() || null, payments: [{ method: 'Cash', amount }] })
  }
)



export const getCurrentCash = () => request<CashShift | null>('/api/cash/current');
export const getCashHistory = () => request<CashShiftHistory[]>('/api/cash/history');
export const openCashShift = (openingCash: number) => request<unknown>('/api/cash/open', { method: 'POST', body: JSON.stringify({ openingCash }) });
export const closeCashShift = (countedCash: number) => request<unknown>('/api/cash/current/close', { method: 'POST', body: JSON.stringify({ countedCash }) });
export const createExpense = (amount: number, paymentMethod: ExpensePaymentMethod, category: string, description: string) => request<unknown>('/api/cash/expenses', { method: 'POST', body: JSON.stringify({ amount, paymentMethod, category, description }) });




export const getSaleDetails = (id: string) => request<SaleDetailResponse>("/api/sales/" + id)

export const createSale = (items: Array<{ productId: string; quantity: number }>, discount: number, method: string, amount: number, customerName: string) => request<SaleResponse>('/api/sales', { method: 'POST', body: JSON.stringify({ items, discount, customerName: customerName.trim() || null, notes: null, payments: [{ method, amount }] }) })

export const createProduct = (name: string, sku: string, unitCost: number, salePrice: number, minimumStock: number, criticalStock: number) => request<Product>('/api/products', { method: 'POST', body: JSON.stringify({ name, sku: sku || null, categoryId: null, unitCost, salePrice, minimumStock, criticalStock }) })
export const deactivateProduct = (id: string) => request<void>('/api/products/' + id + '/deactivate', { method: 'POST' })
export const updateProduct = (id: string, value: { name: string; sku: string; unitCost: number; salePrice: number; minimumStock: number; criticalStock: number }) => request<Product>('/api/products/' + id, { method: 'PATCH', body: JSON.stringify(value) })
export const adjustInventory = (id: string, quantity: number, notes: string) => request<unknown>('/api/inventory/' + id + '/adjust', { method: 'POST', body: JSON.stringify({ quantity, movementType: 'Adjustment', unitCost: null, notes }) })

export const createPurchase = (supplier: string, invoiceReference: string, items: Array<{ productId: string; quantity: number; unitCost: number }>) => request<PurchaseResponse>('/api/purchases', { method: 'POST', body: JSON.stringify({ supplier: supplier || null, invoiceReference: invoiceReference || null, purchaseDate: new Date().toISOString().slice(0, 10), items }) })

export const getInventoryMovements = () => request<InventoryMovementResponse[]>('/api/inventory/movements')
export const confirmPhysicalCount = (items: Array<{ productId: string; physicalQuantity: number }>) => request<PhysicalCountResponse>('/api/inventory/physical-counts', { method: 'POST', body: JSON.stringify({ items }) })
export const getReport = (from: string, to: string) => request<ReportResponse>('/api/reports?from=' + from + '&to=' + to)
export const getEmployees = () => request<EmployeeResponse[]>('/api/users')
export const createEmployee = (email: string, fullName: string, password: string, role: string) => request<EmployeeResponse>('/api/users', { method: 'POST', body: JSON.stringify({ email, fullName, password, role }) })
export const changeEmployeeRole = (id: string, role: string) => request<EmployeeResponse>('/api/users/' + id + '/role', { method: 'PATCH', body: JSON.stringify({ role }) })
export const changeEmployeeStatus = (id: string, isActive: boolean) => request<EmployeeResponse>('/api/users/' + id + '/status', { method: 'PATCH', body: JSON.stringify({ isActive }) })
export const getAuditLogs = () => request<AuditLogResponse[]>('/api/audit?page=1&pageSize=100')
export const getNotifications = (unreadOnly = false) => request<NotificationResponse[]>(`/api/notifications?pageSize=100${unreadOnly ? '&unreadOnly=true' : ''}`)
export const getNotificationPreferences = () => request<NotificationPreferenceResponse>('/api/notification-preferences')
export const updateNotificationPreferences = (value: NotificationPreferenceResponse) => request<NotificationPreferenceResponse>('/api/notification-preferences', { method: 'PUT', body: JSON.stringify(value) })
export const markNotificationRead = (id: string) => request<void>(`/api/notifications/${id}/read`, { method: 'POST' })
export const registerNotificationDevice = (token: string, deviceId: string) => request<unknown>('/api/notification-devices', { method: 'POST', body: JSON.stringify({ token, deviceId, platform: 'web' }) })
export const downloadSaleReceipt = async (saleId: string) => {
  const token = useAuthStore.getState().auth?.accessToken
  const response = await fetch(`${baseUrl}/api/sales/${saleId}/receipt`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null
    throw new Error(body?.detail ?? `Error ${response.status}`)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `comprobante-venta-${saleId}.pdf`
  link.click()
  URL.revokeObjectURL(url)
}
export const downloadReportPdf = async (from: string, to: string) => {
  const token = useAuthStore.getState().auth?.accessToken
  const response = await fetch(`${baseUrl}/api/reports/pdf?from=${from}&to=${to}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null
    throw new Error(body?.detail ?? `Error ${response.status}`)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `reporte-${from}-${to}.pdf`
  link.click()
  URL.revokeObjectURL(url)
}




