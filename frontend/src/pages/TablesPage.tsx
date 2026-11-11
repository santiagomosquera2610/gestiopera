import { useEffect, useMemo, useState } from 'react'
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'
import { Pause, Play, RotateCcw, Square, Plus, Minus, X, Trash2 } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import AppLayout from '../components/AppLayout'
import { addConsumption, closeSession, deleteConsumption, downloadSaleReceipt, updateConsumption, getProducts, getSession, getTables, pauseTable, resumeTable, startTable } from '../api'
import { useAuthStore } from '../authStore'
import type { Product, SessionDetail, SessionResult, Table } from '../types'
import { EmptyState, Feedback, SectionHeading } from '../components/ui'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:5080'
function formatMoney(value: number) { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value) }
function elapsed(table: Table) {
  if (!table.startedAtUtc) return 0
  const pausedNow = table.pausedAtUtc ? Math.max(0, Math.floor((Date.now() - Date.parse(table.pausedAtUtc)) / 1000)) : 0
  return Math.max(0, Math.floor((Date.now() - Date.parse(table.startedAtUtc)) / 1000) - table.totalPausedSeconds - pausedNow)
}
function formatClock(value: string) { return new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function formatTime(seconds: number) { const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = seconds % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` }

export default function TablesPage() {
  const auth = useAuthStore((state) => state.auth)
  const logout = useAuthStore((state) => state.logout)
  const client = useQueryClient()
  const [now, setNow] = useState(Date.now())
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<Table | null>(null)
  const [closed, setClosed] = useState<{ tableName: string; result: SessionResult } | null>(null)
  const { data: tables = [], isLoading, isError, refetch } = useQuery({ queryKey: ['tables'], queryFn: getTables })
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: getProducts })
  const sessionId = selected?.activeSessionId ?? ''
  const { data: detail, refetch: refetchDetail } = useQuery<SessionDetail>({ queryKey: ['session', sessionId], queryFn: () => getSession(sessionId), enabled: Boolean(sessionId), refetchInterval: 5000 })

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    const connection = new HubConnectionBuilder().withUrl(`${apiUrl}/hubs/billiards`, { accessTokenFactory: () => auth?.accessToken ?? '' }).withAutomaticReconnect().configureLogging(LogLevel.Warning).build()
    connection.on('tableUpdated', () => { client.invalidateQueries({ queryKey: ['tables'] }); if (selected?.activeSessionId) void refetchDetail() })
    connection.start().catch(() => undefined)
    return () => { void connection.stop() }
  }, [auth?.accessToken, client, refetchDetail, selected?.activeSessionId])

  const occupied = useMemo(() => tables.filter((table) => table.status !== 'Available').length, [tables])
  const billiardTables = tables.filter((table) => table.kind !== 'Regular')
  const barTables = tables.filter((table) => table.kind === 'Regular')
  async function action(task: () => Promise<unknown>, success: string) { setMessage(''); try { await task(); await refetch(); setMessage(success) } catch (err) { setMessage(err instanceof Error ? err.message : 'No se pudo completar la operación') } }

  void now

  return <AppLayout
    eyebrow="OPERACIÓN"
    title="Mesas">
    <section className="content">
      <div className="summary-row"><div><p className="muted">Estado en tiempo real</p><strong>{occupied} de {tables.length} mesas activas</strong></div><button className="secondary-button" onClick={() => void refetch()}><RotateCcw size={16} />Actualizar</button></div>
      {message && <Feedback>{message}</Feedback>}
      {closed && <Feedback kind="success">{closed.tableName} cerrada · Inicio {formatClock(closed.result.startedAtUtc)}{closed.result.endedAtUtc && ` · Final ${formatClock(closed.result.endedAtUtc)}`} · Total {formatMoney(closed.result.total)} {closed.result.saleId && <button className="secondary-button" onClick={() => void downloadSaleReceipt(closed.result.saleId!)}>Descargar comprobante</button>}</Feedback>}
      {isLoading && <EmptyState>Cargando mesas...</EmptyState>}
      {isError && <div className="error-box">No se pudo conectar con el servidor. Verifica que la API esté en ejecución e intenta de nuevo.</div>}
      {billiardTables.length > 0 && <><h2 className="table-group-title">Mesas de billar</h2><div className="table-grid">{billiardTables.map((table) => <TableCard key={table.id} table={table} onAction={action} onManage={setSelected} />)}</div></>}
      {barTables.length > 0 && <><h2 className="table-group-title">Mesas de bar <span className="muted">· cuenta por consumo</span></h2><div className="table-grid">{barTables.map((table) => <TableCard key={table.id} table={table} onAction={action} onManage={setSelected} />)}</div></>}
      {!isLoading && tables.length === 0 && <div className="empty-state">No hay mesas configuradas.</div>}
    </section>
    {selected && detail && <SessionPanel table={selected} detail={detail} products={products} onClose={() => setSelected(null)} onClosed={(result) => { setMessage(''); setClosed({ tableName: selected.name, result }); setSelected(null) }} onChanged={() => { void refetchDetail(); void refetch() }} />}
  </AppLayout>
}

function TableCard({ table, onAction, onManage }: { table: Table; onAction: (task: () => Promise<unknown>, success: string) => Promise<void>; onManage: (table: Table) => void }) {
  const active = table.status !== 'Available'
  const isBar = table.kind === 'Regular'
  return <article className={`table-card ${table.status.toLowerCase()}`}>
    <div className="card-heading"><div><span className={`status-dot ${table.status.toLowerCase()}`} /><span className="status-text">{table.status === 'Available' ? 'Disponible' : table.status === 'Occupied' ? (isBar ? 'Cuenta abierta' : 'Ocupada') : 'Pausada'}</span></div><span className="table-rate">{isBar ? 'Solo consumo' : `${formatMoney(table.hourlyRate)} / hora`}</span></div>
    <h2>{table.name}</h2>
    {isBar ? <><div className="timer">{active ? formatMoney(table.consumptionTotal) : '—'}</div><p className="muted">{active && table.startedAtUtc ? `Cuenta abierta desde las ${formatClock(table.startedAtUtc)}` : 'Sin cuenta abierta'}</p></>
      : <><div className="timer">{active ? formatTime(elapsed(table)) : '00:00:00'}</div><p className="muted">Incremento de {table.billingIncrementMinutes} minutos</p></>}
    <div className="card-actions">
      {!active && <button className="primary-button" onClick={() => void onAction(() => startTable(table.id), isBar ? 'Cuenta abierta' : 'Mesa iniciada')}><Play size={16} />{isBar ? 'Abrir cuenta' : 'Iniciar'}</button>}
      {table.status === 'Occupied' && !isBar && <button className="secondary-button" onClick={() => void onAction(() => pauseTable(table.id), 'Mesa pausada')}><Pause size={16} />Pausar</button>}
      {table.status === 'Paused' && <button className="secondary-button" onClick={() => void onAction(() => resumeTable(table.id), 'Mesa reanudada')}><Play size={16} />Reanudar</button>}
      {active && <button className="secondary-button" onClick={() => onManage(table)}><Square size={16} />{isBar ? 'Ver cuenta' : 'Gestionar'}</button>}
    </div>
  </article>
}

function SessionPanel({ table, detail, products, onClose, onClosed, onChanged }: { table: Table; detail: SessionDetail; products: Product[]; onClose: () => void; onClosed: (result: SessionResult) => void; onChanged: () => void }) {
  const [productId, setProductId] = useState(products[0]?.id ?? '')
  const [quantity, setQuantity] = useState('1')
  const [amount, setAmount] = useState(String(detail.total))
  const [customerName, setCustomerName] = useState('')
  useEffect(() => { setAmount(String(detail.total)) }, [detail.total])
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [closing, setClosing] = useState(false)
  const [busyLine, setBusyLine] = useState<string | null>(null)
  const available = products.filter((product) => product.isActive && product.currentStock > 0)
  const isBar = table.kind === 'Regular'
  const received = Number(amount)
  const amountMatches = received === detail.total
  const productCount = detail.consumptions.reduce((sum, item) => sum + item.quantity, 0)
  useEffect(() => {
    function onKey(event: KeyboardEvent) { if (event.key === 'Escape' && !closing) { if (confirming) setConfirming(false); else onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirming, closing, onClose])
  async function add() {
    setError('')
    try { await addConsumption(detail.sessionId, productId, Number(quantity)); setQuantity('1'); onChanged() }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo agregar el consumo') }
  }
  async function changeQuantity(consumptionId: string, quantity: number) {
    setError(''); setBusyLine(consumptionId)
    try { await updateConsumption(detail.sessionId, consumptionId, quantity); onChanged() }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cambiar la cantidad') }
    finally { setBusyLine(null) }
  }
  async function remove(consumptionId: string) {
    setError('')
    try { await deleteConsumption(detail.sessionId, consumptionId); onChanged() }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo eliminar el consumo') }
  }
  async function close() {
    setError(''); setClosing(true)
    try { const result = await closeSession(detail.sessionId, received, customerName); onClosed(result); onChanged() }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cerrar la mesa'); setConfirming(false) }
    finally { setClosing(false) }
  }
  return <div className="modal-backdrop"><section className="modal session-modal">
    <SectionHeading eyebrow={isBar ? 'CUENTA ABIERTA' : 'SESIÓN ACTIVA'} title={table.name} action={<button className="modal-close" onClick={onClose} title="Cerrar ventana (Esc)" aria-label="Cerrar ventana" disabled={closing}><X size={20} strokeWidth={2.5} /></button>} />
    <div className="session-body">
    <div className={isBar ? 'session-summary three' : 'session-summary'}><div><span className="muted">{isBar ? 'Abierta' : 'Inicio'}</span><strong>{formatClock(detail.startedAtUtc)}</strong></div>{!isBar && <div><span className="muted">Tiempo</span><strong>{formatTime(detail.elapsedSeconds)}</strong></div>}{isBar ? <div><span className="muted">Consumo</span><strong>{formatMoney(detail.consumptionTotal)}</strong></div> : <div><span className="muted">Mesa</span><strong>{formatMoney(detail.billiardCharge)}</strong></div>}<div><span className="muted">Total</span><strong>{formatMoney(detail.total)}</strong></div></div>
    <div className="consumption-header"><h3>Consumos</h3><span className="muted">{formatMoney(detail.consumptionTotal)}</span></div>
    {detail.consumptions.length === 0 ? <p className="muted">Todavía no hay productos agregados.</p> : <div className="consumption-list">{detail.consumptions.map((item) => <div className="consumption-line" key={item.id}>
      <div className="consumption-name"><span>{item.descriptionSnapshot}</span><small className="muted">{formatMoney(item.unitPrice)} c/u</small></div>
      <span className="consumption-actions">
        {confirming ? <span className="quantity-readonly">x {item.quantity}</span> : <span className="quantity-stepper"><button title="Quitar una unidad" aria-label={`Quitar una unidad de ${item.descriptionSnapshot}`} disabled={item.quantity <= 1 || busyLine === item.id} onClick={() => void changeQuantity(item.id, item.quantity - 1)}><Minus size={14} /></button><span aria-live="polite">{item.quantity}</span><button title="Agregar una unidad" aria-label={`Agregar una unidad de ${item.descriptionSnapshot}`} disabled={busyLine === item.id} onClick={() => void changeQuantity(item.id, item.quantity + 1)}><Plus size={14} /></button></span>}
        <strong className="consumption-subtotal">{formatMoney(item.subtotal)}</strong>
        {!confirming && <button className="icon-button danger-icon" title="Quitar producto de la cuenta" onClick={() => void remove(item.id)}><Trash2 size={16} /></button>}
      </span>
    </div>)}</div>}
    {!confirming && <div className="add-consumption"><select value={productId} onChange={(e) => setProductId(e.target.value)}><option value="">Selecciona un producto</option>{available.map((product) => <option key={product.id} value={product.id}>{product.name} - {formatMoney(product.salePrice)} - stock {product.currentStock}</option>)}</select><input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} /><button className="primary-button" disabled={!productId} onClick={() => void add()}><Plus size={16} />Agregar</button></div>}
    {error && <div className="error-box">{error}</div>}
    </div>
    {!confirming ? <div className="close-section"><label>Nombre para la venta o factura<input value={customerName} maxLength={160} placeholder="Opcional" onChange={(e) => setCustomerName(e.target.value)} /></label><label>Total recibido (COP)<input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></label><button className="danger-button" disabled={isBar && detail.consumptions.length === 0} onClick={() => { setError(''); setConfirming(true) }}>{isBar ? 'Cerrar cuenta y cobrar' : 'Cerrar mesa y cobrar'}</button></div>
      : <div className="close-confirm" role="alertdialog" aria-labelledby="close-confirm-title">
        <p className="eyebrow">CONFIRMAR COBRO</p>
        <h3 id="close-confirm-title">¿{isBar ? 'Cerrar la cuenta' : 'Cerrar la mesa'} de {table.name}?</h3>
        <div className="confirm-lines">
          {!isBar && <div><span>Tiempo de mesa · {detail.billedMinutes} min</span><strong>{formatMoney(detail.billiardCharge)}</strong></div>}
          <div><span>Consumos · {productCount} {productCount === 1 ? 'producto' : 'productos'}</span><strong>{formatMoney(detail.consumptionTotal)}</strong></div>
          <div><span>A nombre de</span><strong>{customerName.trim() || 'Sin nombre'}</strong></div>
          <div className="confirm-total"><span>Total a cobrar</span><strong>{formatMoney(detail.total)}</strong></div>
        </div>
        {!amountMatches && <div className="error-box">El total recibido ({formatMoney(received || 0)}) no coincide con el total a cobrar. Vuelve y corrígelo.</div>}
        <p className="muted">Se registrará la venta y se descontará el inventario. Esta acción no se puede deshacer.</p>
        <div className="modal-actions"><button className="secondary-button" disabled={closing} onClick={() => setConfirming(false)}>Volver</button><button className="danger-solid" disabled={closing || !amountMatches} onClick={() => void close()}>{closing ? 'Cobrando...' : 'Sí, cerrar y cobrar'}</button></div>
      </div>}
  </section></div>
}

