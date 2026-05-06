import { useEffect, useState, useCallback } from 'react'
import { FormProvider, useForm } from './context/FormContext'
import { DiagnosticoProvider, useDiagnostico } from './context/DiagnosticoContext'
import { AuthProvider, useAuth, useRol } from './context/AuthContext'
import LoginScreen from './components/LoginScreen'
import DiagnosticoForm from './DiagnosticoForm'
import PresupuestoForm from './PresupuestoForm'
import OTForm from './OTForm'
import TecnicoScreen from './TecnicoScreen'
import ProgressBar from './components/common/ProgressBar'
import Section1_Cliente from './components/sections/Section1_Cliente'
import Section2_Vehiculo from './components/sections/Section2_Vehiculo'
import Section3_Ingreso from './components/sections/Section3_Ingreso'
import Section4_EstadoVehiculo from './components/sections/Section4_EstadoVehiculo'
import Section5_TrabajoSolicitado from './components/sections/Section5_TrabajoSolicitado'
import Section6_FirmaCliente from './components/sections/Section6_FirmaCliente'
import Section7_RecepcionSECCO from './components/sections/Section7_RecepcionSECCO'
import Section8_Checklist from './components/sections/Section8_Checklist'
import { logout } from './lib/auth'
import { suscribirTabla } from './lib/realtime'
import {
  guardarBorrador,
  actualizarActa,
  subirFoto,
  subirFotoBase64,
  buscarBorradorPorPatente,
  listarBorradoresRecientes,
  listarActasCerradas,
  cargarActaCompleta,
  crearDiagnostico,
  buscarDiagnosticoPorPatente,
  listarDiagnosticos,
  cargarDiagnosticoCompleto,
  listarDiagnosticosParaCotizar,
  listarCotizaciones,
  listarCotizacionesSinAsignar,
  crearCotizacionDesdeDiagnostico,
  crearCotizacionManual,
  asignarCotizacionAActa,
  cargarCotizacionCompleta,
  listarOTs,
  cargarOTCompleta,
  supabaseConfigurado,
} from './lib/supabase'
import { generarPDFActa, generarPDFDesdeActaGuardada } from './lib/pdf'
import { generarPDFPresupuestoCliente } from './lib/pdfPresupuesto'
import { notificarIngresoActa } from './lib/emailNotifications'

// ─── Spinner inline ────────────────────────────────────────────
const Spinner = ({ size = 20, color = '#a98225' }) => (
  <div style={{ width: size, height: size, border: `2px solid ${color}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
)

function fechaAtencion(fecha) {
  if (!fecha) return { diaSemana: 'Sin fecha', dia: '--', mes: '', anio: '' }
  const date = new Date(fecha)
  if (Number.isNaN(date.getTime())) return { diaSemana: 'Sin fecha', dia: '--', mes: '', anio: '' }
  const diaSemana = date.toLocaleDateString('es-CL', { weekday: 'long' })
  const mes = date.toLocaleDateString('es-CL', { month: 'short' }).replace('.', '')
  return {
    diaSemana: diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1),
    dia: date.toLocaleDateString('es-CL', { day: '2-digit' }),
    mes: mes.charAt(0).toUpperCase() + mes.slice(1),
    anio: date.getFullYear(),
    completa: date.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' }),
  }
}

function mesAtencion(fecha) {
  if (!fecha) return 'Sin fecha'
  const date = new Date(fecha)
  if (Number.isNaN(date.getTime())) return 'Sin fecha'
  const label = date.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function statusText(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\bdanos\b/gi, 'daños')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

const HISTORIAL_FILTERS_INICIAL = {
  fechaDesde: '',
  fechaHasta: '',
  patente: '',
  numeroOt: '',
}

// ─── Visualizador de acta ─────────────────────────────────────
function CampoActa({ label, value, full }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <p style={{ margin: '0 0 2px', fontSize: 10, color: '#6B6B6B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</p>
      <p style={{ margin: 0, fontSize: 13, color: '#111114', fontWeight: 500, lineHeight: 1.4 }}>{value}</p>
    </div>
  )
}

function SeccionActa({ titulo, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#a98225', borderBottom: '1px solid rgba(169,130,37,0.2)', paddingBottom: 6 }}>{titulo}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
        {children}
      </div>
    </div>
  )
}

const TIPOS_FOTO_ORDEN = ['frontal', 'trasera', 'lateral_izq', 'lateral_der', 'danos', 'interior', 'km', 'combustible', 'firma_cliente', 'firma_secco']

function ModalVisualizarActa({ acta, onClose, onDescargar, descargando }) {
  const cliente = acta.clientes || {}
  const vehiculo = acta.vehiculos || {}
  const fotos = acta.fotos_acta || []

  const fotosMap = {}
  for (const f of fotos) {
    fotosMap[f.tipo] = [...(fotosMap[f.tipo] || []), f.url]
  }

  const fechaIngreso = acta.fecha_ingreso
    ? new Date(acta.fecha_ingreso + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—'

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
    >
      <div style={{ background: '#FFFFFF', borderRadius: '20px 20px 0 0', maxHeight: '92svh', display: 'flex', flexDirection: 'column', boxShadow: '0 -8px 32px rgba(0,0,0,0.15)' }}>

        <div style={{ padding: '12px 0 4px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, background: '#E0E0E0', borderRadius: 2 }} />
        </div>

        <div style={{ padding: '8px 16px 12px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #E0E0E0', flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: '0 0 2px', fontWeight: 800, fontSize: 15, color: '#111114', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {acta.numero_acta ? `Acta #${acta.numero_acta}` : 'Acta de recepción'}
              {vehiculo.patente && (
                <span style={{ fontFamily: 'monospace', background: '#111114', color: '#FFFFFF', padding: '1px 7px', borderRadius: 5, fontSize: 12 }}>
                  {vehiculo.patente}
                </span>
              )}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: '#6B6B6B' }}>
              {[vehiculo.marca, vehiculo.modelo].filter(Boolean).join(' ')} · {fechaIngreso}
            </p>
          </div>
          <button type="button" onClick={onDescargar} disabled={descargando}
            style={{ height: 38, padding: '0 14px', borderRadius: 8, border: '1.5px solid #a98225', background: '#FFFFFF', color: '#a98225', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, opacity: descargando ? 0.5 : 1, whiteSpace: 'nowrap' }}
          >
            {descargando ? <Spinner size={13} /> : '↓'} PDF
          </button>
          <button type="button" onClick={onClose}
            style={{ width: 38, height: 38, borderRadius: 8, border: '1px solid #E0E0E0', background: '#F5F5F5', color: '#6B6B6B', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >×</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 16px 48px', WebkitOverflowScrolling: 'touch' }}>

          {acta.status && (
            <div style={{ marginBottom: 16 }}>
              <span style={{
                background: acta.status === 'cerrada' ? 'rgba(34,139,80,0.1)' : 'rgba(169,130,37,0.1)',
                color: acta.status === 'cerrada' ? '#228b50' : '#a98225',
                border: `1px solid ${acta.status === 'cerrada' ? 'rgba(34,139,80,0.3)' : 'rgba(169,130,37,0.3)'}`,
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, textTransform: 'capitalize',
              }}>
                {statusText(acta.status)}
              </span>
            </div>
          )}

          <SeccionActa titulo="Cliente">
            <CampoActa label="Nombre" value={cliente.nombre} full />
            <CampoActa label="RUT" value={cliente.rut} />
            <CampoActa label="Teléfono" value={cliente.telefono} />
            <CampoActa label="Correo" value={cliente.email} />
          </SeccionActa>

          <SeccionActa titulo="Vehículo">
            <CampoActa label="Marca" value={vehiculo.marca} />
            <CampoActa label="Modelo" value={vehiculo.modelo} />
            <CampoActa label="Año" value={vehiculo.anio} />
            <CampoActa label="Patente" value={vehiculo.patente} />
            <CampoActa label="VIN" value={vehiculo.vin} full />
            <CampoActa label="Color" value={vehiculo.color} />
          </SeccionActa>

          <SeccionActa titulo="Datos de ingreso">
            <CampoActa label="Fecha" value={fechaIngreso} />
            <CampoActa label="Hora" value={acta.hora_ingreso?.slice(0, 5)} />
            <CampoActa label="Kilometraje" value={acta.km != null ? `${Number(acta.km).toLocaleString('es-CL')} km` : null} />
            <CampoActa label="Combustible" value={acta.combustible} />
            <CampoActa label="Llaves" value={acta.llaves != null ? String(acta.llaves) : null} />
            {Array.isArray(acta.documentacion) && acta.documentacion.length > 0 && (
              <CampoActa label="Documentación" value={acta.documentacion.join(', ')} full />
            )}
          </SeccionActa>

          {(acta.estado_exterior || acta.estado_interior) && (
            <SeccionActa titulo="Estado del vehículo">
              <CampoActa label="Exterior" value={statusText(acta.estado_exterior)} />
              <CampoActa label="Interior" value={statusText(acta.estado_interior)} />
              <CampoActa label="Detalle exterior" value={acta.detalle_exterior} full />
              <CampoActa label="Detalle interior" value={acta.detalle_interior} full />
            </SeccionActa>
          )}

          {acta.trabajo_solicitado && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#a98225', borderBottom: '1px solid rgba(169,130,37,0.2)', paddingBottom: 6 }}>Trabajo solicitado</p>
              <p style={{ margin: 0, fontSize: 13, color: '#111114', lineHeight: 1.5, background: '#FAFAFA', borderRadius: 8, padding: '10px 12px', border: '1px solid #EEEEEE' }}>{acta.trabajo_solicitado}</p>
            </div>
          )}

          {(acta.tc_nombre || acta.tecnico_nombre) && (
            <SeccionActa titulo="Responsable SECCO">
              <CampoActa label="Responsable" value={acta.tc_nombre || acta.tecnico_nombre} full />
            </SeccionActa>
          )}

          {fotos.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#a98225', borderBottom: '1px solid rgba(169,130,37,0.2)', paddingBottom: 6 }}>
                Fotos ({fotos.length})
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {TIPOS_FOTO_ORDEN.flatMap((tipo) =>
                  (fotosMap[tipo] || []).map((url, idx) => (
                    <div key={`${tipo}-${idx}`} style={{ borderRadius: 8, overflow: 'hidden', background: '#F5F5F5', border: '1px solid #EEEEEE', aspectRatio: '4/3' }}>
                      <img
                        src={url}
                        alt={tipo.replace(/_/g, ' ')}
                        loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        onError={(e) => { e.target.parentElement.style.display = 'none' }}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ─── HomeScreen ───────────────────────────────────────────────
function HomeScreen({ onNueva, onRetomarActa, onAbrirDiagnostico, onAbrirPresupuesto, onAbrirOT, onTecnicos }) {
  const { usuario } = useAuth()
  const { esAdmin, esTecnico, nombre: nombreUsuario, puedeVerPresupuestos, puedeVerHistorial } = useRol()

  const [patente, setPatente]       = useState('')
  const [buscando, setBuscando]     = useState(false)
  const [resultados, setResultados] = useState(null)
  const [errorBusq, setErrorBusq]   = useState('')
  const [tab, setTab]               = useState('borradores')
  const [historial, setHistorial]   = useState(null)
  const [filtrosHistorial, setFiltrosHistorial] = useState(HISTORIAL_FILTERS_INICIAL)
  const [showFiltrosHistorial, setShowFiltrosHistorial] = useState(false)
  const [cargandoH, setCargandoH]   = useState(false)
  const [descargando, setDescargando] = useState(null)
  const [borradores, setBorradores] = useState(null)
  const [cargandoB, setCargandoB] = useState(false)
  const [diagnosticos, setDiagnosticos] = useState(null)
  const [cargandoD, setCargandoD] = useState(false)
  const [abriendoDiag, setAbriendoDiag] = useState(null)
  const [presupuestos, setPresupuestos] = useState(null)
  const [diagnosticosListos, setDiagnosticosListos] = useState(null)
  const [cargandoP, setCargandoP] = useState(false)
  const [abriendoP, setAbriendoP] = useState(null)
  const [ots, setOts] = useState(null)
  const [cargandoOT, setCargandoOT] = useState(false)
  const [abriendoOT, setAbriendoOT] = useState(null)
  const [actaVisualizando, setActaVisualizando] = useState(null)
  const [cargandoVisualizacion, setCargandoVisualizacion] = useState(null)

  // Modal nuevo presupuesto manual
  const [showNuevoPresupuesto, setShowNuevoPresupuesto] = useState(false)
  const [datosManuales, setDatosManuales] = useState({ marca: '', modelo: '', patente: '', anio: '', nombre: '', telefono: '' })
  const [creandoManual, setCreandoManual] = useState(false)

  // Acordeón del historial: { [patente]: boolean }
  const [vehiculosAbiertos, setVehiculosAbiertos] = useState({})

  // Badges de notificaciones por tab (realtime)
  const [badges, setBadges] = useState({ diagnosticos: 0, ots: 0, presupuestos: 0 })

  const supabaseOk = supabaseConfigurado()

  // ── Carga inicial de borradores ─────────────────────────────
  useEffect(() => {
    if (!supabaseOk || borradores !== null) return
    cargarBorradores()
  }, [supabaseOk, borradores])

  // ── Suscripciones realtime ──────────────────────────────────
  useEffect(() => {
    if (!supabaseOk) return

    const unsubDiag = suscribirTabla('diagnosticos', (payload) => {
      const nuevo = payload.new || {}
      if (nuevo.status === 'listo') {
        setBadges((b) => ({ ...b, presupuestos: b.presupuestos + 1 }))
        // Invalidar caché de presupuestos para que recargue en el próximo click
        setDiagnosticosListos(null)
        setPresupuestos(null)
      }
      // Invalidar diagnósticos activos
      setDiagnosticos(null)
    })

    const unsubOT = suscribirTabla('ordenes_trabajo', () => {
      setBadges((b) => ({ ...b, ots: b.ots + 1 }))
      setOts(null)
    })

    return () => {
      unsubDiag()
      unsubOT()
    }
  }, [supabaseOk])

  // ── Helpers ─────────────────────────────────────────────────
  function patenteDeActa(acta) {
    return acta.vehiculos?.patente || 'SIN PATENTE'
  }

  function patenteDeDiagnostico(diag) {
    return diag.actas?.vehiculos?.patente || 'SIN PATENTE'
  }

  function agruparPorPatente(items, getPatente) {
    const groups = []
    const index = {}
    for (const item of items || []) {
      const patenteKey = getPatente(item)
      if (!index[patenteKey]) {
        index[patenteKey] = { patente: patenteKey, items: [] }
        groups.push(index[patenteKey])
      }
      index[patenteKey].items.push(item)
    }
    return groups
  }

  function agruparHistorial(items) {
    const groups = []
    const index = {}
    for (const item of items || []) {
      const patenteKey = item.patente || 'SIN PATENTE'
      if (!index[patenteKey]) {
        index[patenteKey] = {
          patente: patenteKey,
          vehiculo: item.vehiculo,
          cliente: item.cliente,
          actas: [],
          diagnosticos: [],
          cotizaciones: [],
          registros: [],
          ultimaFecha: item.fecha || null,
        }
        groups.push(index[patenteKey])
      }
      index[patenteKey].registros.push(item)
      if (new Date(item.fecha || 0) > new Date(index[patenteKey].ultimaFecha || 0)) {
        index[patenteKey].ultimaFecha = item.fecha
      }
      if (item.tipo === 'acta') index[patenteKey].actas.push(item)
      else if (item.tipo === 'diagnostico') index[patenteKey].diagnosticos.push(item)
      else if (item.tipo === 'cotizacion') index[patenteKey].cotizaciones.push(item)
    }
    return groups
      .map((grupo) => ({
        ...grupo,
        registros: grupo.registros.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0)),
      }))
      .sort((a, b) => new Date(b.ultimaFecha || 0) - new Date(a.ultimaFecha || 0))
  }

  function filtrarHistorial(items) {
    const filtros = filtrosHistorial
    const desde = filtros.fechaDesde ? new Date(`${filtros.fechaDesde}T00:00:00`) : null
    const hasta = filtros.fechaHasta ? new Date(`${filtros.fechaHasta}T23:59:59`) : null
    return (items || [])
      .filter((item) => !filtros.patente || item.patente?.toLowerCase().includes(filtros.patente.toLowerCase()))
      .filter((item) => !filtros.numeroOt || (item.tipo === 'ot' && String(item.ot?.numero_ot || '').includes(filtros.numeroOt.replace(/\D/g, ''))))
      .filter((item) => {
        const fecha = item.fecha ? new Date(item.fecha) : null
        if (desde && (!fecha || fecha < desde)) return false
        if (hasta && (!fecha || fecha > hasta)) return false
        return true
      })
  }

  function agruparVehiculosPorMes(grupos) {
    const sections = []
    const index = {}
    for (const grupo of grupos || []) {
      const key = mesAtencion(grupo.ultimaFecha)
      if (!index[key]) {
        index[key] = { mes: key, grupos: [] }
        sections.push(index[key])
      }
      index[key].grupos.push(grupo)
    }
    return sections
  }

  async function cargarBorradores() {
    setCargandoB(true)
    try { setBorradores(await listarBorradoresRecientes(30)) }
    catch { setBorradores([]) }
    finally { setCargandoB(false) }
  }

  async function handleBuscar() {
    if (!patente.trim()) return
    setBuscando(true); setErrorBusq(''); setResultados(null)
    try {
      const rows = tab === 'diagnosticos'
        ? await buscarDiagnosticoPorPatente(patente)
        : await buscarBorradorPorPatente(patente)
      setResultados(rows)
      if (!rows.length) setErrorBusq(tab === 'diagnosticos'
        ? 'No hay diagnósticos pendientes para esa patente.'
        : 'No hay borradores abiertos para esa patente.'
      )
    } catch { setErrorBusq('Error al buscar. Verifica la conexión.') }
    finally { setBuscando(false) }
  }

  async function handleTabHistorial() {
    setTab('historial'); setResultados(null); setErrorBusq(''); setFiltrosHistorial(HISTORIAL_FILTERS_INICIAL)
    setShowFiltrosHistorial(false)
    if (historial !== null) return
    setCargandoH(true)
    try {
      const [actas, diags, cots, otsHist] = await Promise.all([
        listarActasCerradas(100),
        listarDiagnosticos(100),
        listarCotizaciones(100),
        listarOTs(100),
      ])
      const actaItems = (actas || []).map((acta) => ({
        tipo: 'acta',
        id: acta.id,
        fecha: acta.updated_at || acta.created_at || acta.fecha_ingreso,
        patente: acta.vehiculos?.patente || 'SIN PATENTE',
        vehiculo: `${acta.vehiculos?.marca || ''} ${acta.vehiculos?.modelo || ''}`.trim(),
        marca: acta.vehiculos?.marca || '',
        modelo: acta.vehiculos?.modelo || '',
        cliente: acta.clientes?.nombre || '',
        estado: acta.status || 'borrador',
        responsable: acta.tc_nombre || acta.tecnico_nombre || '',
        acta,
      }))
      const diagItems = (diags || []).filter((d) => ['proceso', 'listo', 'cerrado'].includes(d.status)).map((diag) => ({
        tipo: 'diagnostico',
        id: diag.id,
        fecha: diag.fecha_cierre || diag.fecha_creacion,
        patente: diag.actas?.vehiculos?.patente || 'SIN PATENTE',
        vehiculo: `${diag.actas?.vehiculos?.marca || ''} ${diag.actas?.vehiculos?.modelo || ''}`.trim(),
        marca: diag.actas?.vehiculos?.marca || '',
        modelo: diag.actas?.vehiculos?.modelo || '',
        cliente: diag.actas?.clientes?.nombre || '',
        estado: diag.status || '',
        responsable: diag.tecnico_asignado || diag.actas?.tecnico_nombre || '',
        diagnostico: diag,
      }))
      const cotItems = (cots || []).map((cot) => ({
        tipo: 'cotizacion',
        id: cot.id,
        fecha: cot.updated_at || cot.created_at,
        patente: cot.vehiculos?.patente || cot.vista_cliente?.vehiculo_manual?.patente || 'SIN ASIGNAR',
        vehiculo: `${cot.vehiculos?.marca || cot.vista_cliente?.vehiculo_manual?.marca || ''} ${cot.vehiculos?.modelo || cot.vista_cliente?.vehiculo_manual?.modelo || ''}`.trim() || 'Presupuesto sin vehículo',
        marca: cot.vehiculos?.marca || cot.vista_cliente?.vehiculo_manual?.marca || '',
        modelo: cot.vehiculos?.modelo || cot.vista_cliente?.vehiculo_manual?.modelo || '',
        cliente: cot.clientes?.nombre || cot.vista_cliente?.cliente_manual?.nombre || '',
        estado: cot.status || '',
        responsable: cot.notas_internas || '',
        cotizacion: cot,
      }))
      const otItems = (otsHist || []).map((ot) => {
        const veh = ot.vehiculos || ot.actas?.vehiculos || {}
        const cli = ot.clientes || ot.actas?.clientes || {}
        return {
          tipo: 'ot',
          id: ot.id,
          fecha: ot.updated_at || ot.created_at,
          patente: veh.patente || 'SIN PATENTE',
          vehiculo: `${veh.marca || ''} ${veh.modelo || ''}`.trim(),
          marca: veh.marca || '',
          modelo: veh.modelo || '',
          cliente: cli.nombre || '',
          estado: ot.status || '',
          responsable: ot.tecnico_nombre || '',
          ot,
        }
      })
      setHistorial([...actaItems, ...diagItems, ...cotItems, ...otItems].sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0)))
    }
    catch { setHistorial([]) }
    finally { setCargandoH(false) }
  }

  async function handleTabDiagnosticos() {
    setTab('diagnosticos'); setResultados(null); setErrorBusq('')
    setBadges((b) => ({ ...b, diagnosticos: 0 }))
    if (diagnosticos !== null) return
    setCargandoD(true)
    try {
      const rows = await listarDiagnosticos(30)
      setDiagnosticos(rows.filter((d) => ['pendiente', 'proceso'].includes(d.status)))
    } catch { setDiagnosticos([]) }
    finally { setCargandoD(false) }
  }

  async function handleTabPresupuestos() {
    setTab('presupuestos'); setResultados(null); setErrorBusq('')
    setBadges((b) => ({ ...b, presupuestos: 0 }))
    if (presupuestos !== null && diagnosticosListos !== null) return
    setCargandoP(true)
    try {
      const [diags, cots] = await Promise.all([
        listarDiagnosticosParaCotizar(30),
        listarCotizaciones(30),
      ])
      const cotDiagIds = new Set((cots || []).map((c) => c.diagnostico_id).filter(Boolean))
      setDiagnosticosListos((diags || []).filter((d) => !cotDiagIds.has(d.id)))
      setPresupuestos(cots || [])
    } catch {
      setDiagnosticosListos([])
      setPresupuestos([])
    } finally {
      setCargandoP(false)
    }
  }

  async function handleTabOTs() {
    setTab('ots'); setResultados(null); setErrorBusq('')
    setBadges((b) => ({ ...b, ots: 0 }))
    if (ots !== null) return
    setCargandoOT(true)
    try { setOts(await listarOTs(30)) }
    catch { setOts([]) }
    finally { setCargandoOT(false) }
  }

  async function handleAbrirOT(ot) {
    setAbriendoOT(ot.id)
    try {
      const completa = await cargarOTCompleta(ot.id)
      onAbrirOT(completa)
    } catch (e) { alert(`Error al abrir OT: ${e.message}`) }
    finally { setAbriendoOT(null) }
  }

  async function handleAbrirDiagnostico(diagnostico) {
    setAbriendoDiag(diagnostico.id)
    try {
      const completo = await cargarDiagnosticoCompleto(diagnostico.id)
      onAbrirDiagnostico(completo)
    } catch (e) { alert(`Error al abrir diagnóstico: ${e.message}`) }
    finally { setAbriendoDiag(null) }
  }

  async function handleCrearPresupuesto(diagnostico) {
    setAbriendoP(diagnostico.id)
    try {
      const completa = await crearCotizacionDesdeDiagnostico(diagnostico.id)
      onAbrirPresupuesto(completa)
    } catch (e) { alert(`Error al crear presupuesto: ${e.message}`) }
    finally { setAbriendoP(null) }
  }

  async function handleAbrirCotizacion(cotizacion) {
    setAbriendoP(cotizacion.id)
    try {
      const completa = await cargarCotizacionCompleta(cotizacion.id)
      onAbrirPresupuesto(completa)
    } catch (e) { alert(`Error al abrir presupuesto: ${e.message}`) }
    finally { setAbriendoP(null) }
  }

  async function handleCrearPresupuestoManual() {
    setCreandoManual(true)
    try {
      const completa = await crearCotizacionManual({ ...datosManuales, patente: datosManuales.patente.toUpperCase() })
      setShowNuevoPresupuesto(false)
      setDatosManuales({ marca: '', modelo: '', patente: '', anio: '', nombre: '', telefono: '' })
      onAbrirPresupuesto(completa)
    } catch (e) { alert(`Error al crear presupuesto: ${e.message}`) }
    finally { setCreandoManual(false) }
  }

  async function handleDescargar(acta) {
    setDescargando(acta.id)
    try {
      const completa = await cargarActaCompleta(acta.id)
      const patente = (completa.vehiculos?.patente || 'sin-patente').toLowerCase()
      const fecha = (completa.fecha_ingreso || new Date().toISOString()).slice(0, 10)
      await generarPDFDesdeActaGuardada(completa, { filename: `acta-mantencion-${patente}-${fecha}.pdf` })
    } catch (e) { alert(`Error al generar PDF: ${e.message}`) }
    finally { setDescargando(null) }
  }

  async function handleVisualizar(acta) {
    setCargandoVisualizacion(acta.id)
    try {
      const completa = await cargarActaCompleta(acta.id)
      setActaVisualizando(completa)
    } catch (e) { alert(`Error al cargar el acta: ${e.message}`) }
    finally { setCargandoVisualizacion(null) }
  }

  async function handleDescargarCotizacion(cotizacion) {
    setDescargando(`cot-${cotizacion.id}`)
    try {
      const completa = await cargarCotizacionCompleta(cotizacion.id)
      await generarPDFPresupuestoCliente(completa)
    } catch (e) { alert(`Error al generar PDF: ${e.message}`) }
    finally { setDescargando(null) }
  }

  // Descarga todos los PDFs de un vehículo como ZIP
  async function handleDescargarTodo(grupo) {
    setDescargando(`grupo-${grupo.patente}`)
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()

      const promesas = []

      for (const item of grupo.actas) {
        promesas.push(
          cargarActaCompleta(item.acta.id)
            .then((completa) => generarPDFDesdeActaGuardada(completa, { returnBlob: true }))
            .then((blob) => blob && zip.file(`Acta_${item.acta.numero_acta || item.acta.id}.pdf`, blob))
        )
      }

      for (const item of grupo.cotizaciones) {
        promesas.push(
          cargarCotizacionCompleta(item.cotizacion.id)
            .then((completa) => generarPDFPresupuestoCliente(completa, { returnBlob: true }))
            .then((blob) => blob && zip.file(`Cotizacion_${item.cotizacion.numero_cotizacion || item.cotizacion.id}.pdf`, blob))
        )
      }

      await Promise.all(promesas)

      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `SECCO_${grupo.patente}_${new Date().toISOString().slice(0, 10)}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { alert(`Error al generar ZIP: ${e.message}`) }
    finally { setDescargando(null) }
  }

  function toggleVehiculo(patente) {
    setVehiculosAbiertos((prev) => ({ ...prev, [patente]: !prev[patente] }))
  }

  // ── Estilos ──────────────────────────────────────────────────
  const tabBtn = (active) => ({
    flex: '1 1 120px', padding: '11px 10px', borderRadius: 10, fontSize: 13, fontWeight: 600,
    border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 150ms',
    background: active ? '#FFFFFF' : 'transparent',
    color: active ? '#111114' : '#6B6B6B',
    boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
    position: 'relative',
  })

  function TabBadge({ count }) {
    if (!count) return null
    return (
      <span style={{
        position: 'absolute', top: 4, right: 6,
        background: '#FF453A', color: '#FFF',
        borderRadius: '50%', width: 14, height: 14,
        fontSize: 9, fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{count > 9 ? '9+' : count}</span>
    )
  }

  const historialFiltrado = filtrarHistorial(historial)
  const gruposHistorial = agruparHistorial(historialFiltrado)
  const filtrosActivosHistorial = Object.values(filtrosHistorial).filter(Boolean).length

  return (
    <div style={{ minHeight: '100svh', background: '#FFFFFF', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E0E0E0', padding: '20px 24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <img src="/logo-secco.png" alt="SECCO"
          style={{ height: 48, objectFit: 'contain', marginBottom: 8 }}
          onError={(e) => { e.target.style.display = 'none' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <p style={{ color: '#6B6B6B', fontSize: 12, margin: 0 }}>
            {nombreUsuario || 'Usuario'} ·
          </p>
          <button
            type="button"
            onClick={() => logout().catch(() => {})}
            style={{ background: 'none', border: 'none', color: '#a98225', fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontWeight: 600 }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      <div style={{ flex: 1, padding: '24px 16px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Alerta sin Supabase */}
        {!supabaseOk && (
          <div style={{ background: 'rgba(169,130,37,0.06)', border: '1px solid rgba(169,130,37,0.25)', borderRadius: 12, padding: 16, display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>⚙️</span>
            <div>
              <p style={{ color: '#a98225', fontWeight: 600, fontSize: 13, margin: '0 0 2px' }}>Modo sin conexión</p>
              <p style={{ color: '#6B6B6B', fontSize: 12, margin: 0 }}>
                Configura <code style={{ background: '#F5F5F5', padding: '1px 5px', borderRadius: 4, color: '#111114' }}>.env</code> para activar Supabase.
              </p>
            </div>
          </div>
        )}

        {/* Nueva acta */}
        <button type="button" onClick={onNueva} className="s-btn-primary" style={{ fontSize: 17, height: 58 }}>
          + Nueva acta de recepción
        </button>

        {supabaseOk && (
          <>
            {/* Tabs */}
            <div style={{ background: '#F5F5F5', borderRadius: 12, padding: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => { setTab('borradores'); setResultados(null); setErrorBusq('') }} style={tabBtn(tab === 'borradores')}>
                Borradores
              </button>
              {puedeVerHistorial && (
                <button type="button" onClick={handleTabHistorial} style={tabBtn(tab === 'historial')}>
                  Historial
                </button>
              )}
              <button type="button" onClick={handleTabDiagnosticos} style={tabBtn(tab === 'diagnosticos')}>
                Diagnósticos
                <TabBadge count={badges.diagnosticos} />
              </button>
              {puedeVerPresupuestos && (
                <button type="button" onClick={handleTabPresupuestos} style={tabBtn(tab === 'presupuestos')}>
                  Presupuestos
                  <TabBadge count={badges.presupuestos} />
                </button>
              )}
              <button type="button" onClick={handleTabOTs} style={tabBtn(tab === 'ots')}>
                Órdenes
                <TabBadge count={badges.ots} />
              </button>
              <button type="button" onClick={onTecnicos} style={tabBtn(false)}>
                Técnico
              </button>
            </div>

            {/* ── Tab: Borradores ──────────────────────────────── */}
            {tab === 'borradores' && (
              <div className="s-card">
                <p style={{ color: '#6B6B6B', fontSize: 13, marginTop: 0, marginBottom: 14 }}>
                  El Técnico busca la patente para retomar un acta iniciada por Torre de Control.
                </p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input type="text" value={patente}
                    onChange={(e) => { setPatente(e.target.value.toUpperCase()); setResultados(null); setErrorBusq('') }}
                    onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
                    placeholder="Patente — ABCD12"
                    maxLength={8} autoCapitalize="characters"
                    className="s-input"
                    style={{ flex: 1, fontFamily: 'monospace', letterSpacing: '2px', padding: '13px 14px' }}
                  />
                  <button type="button" onClick={handleBuscar} disabled={buscando || !patente.trim()}
                    style={{
                      background: '#a98225', color: '#FFFFFF', fontWeight: 700, border: 'none',
                      borderRadius: 10, padding: '0 20px', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit',
                      opacity: buscando || !patente.trim() ? 0.4 : 1,
                    }}
                  >
                    {buscando ? <Spinner size={18} color="#FFFFFF" /> : 'Buscar'}
                  </button>
                </div>

                {errorBusq && <p style={{ color: '#FF453A', fontSize: 12, margin: '0 0 8px' }}>⚠ {errorBusq}</p>}

                {cargandoB ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 }}>
                    <Spinner /><span style={{ color: '#6B6B6B', fontSize: 14 }}>Cargando stand-by…</span>
                  </div>
                ) : (
                  agruparPorPatente(resultados || borradores || [], patenteDeActa).map((grupo) => (
                    <div key={grupo.patente} style={{ marginTop: 12 }}>
                      <p style={{ color: '#a98225', fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', margin: '0 0 8px' }}>
                        {grupo.patente}
                      </p>
                      {grupo.items.map((acta) => (
                        <button key={acta.id} type="button" onClick={() => onRetomarActa(acta)}
                          style={{
                            width: '100%', textAlign: 'left', background: 'rgba(169,130,37,0.06)',
                            border: '1px solid rgba(169,130,37,0.25)', borderRadius: 10, padding: 14,
                            cursor: 'pointer', marginBottom: 8, fontFamily: 'inherit',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 14, color: '#111114' }}>
                                {acta.vehiculos?.marca} {acta.vehiculos?.modelo}
                              </p>
                              <p style={{ margin: 0, fontSize: 12, color: '#6B6B6B' }}>
                                {acta.clientes?.nombre || 'Sin cliente'} · Stand-by técnico
                              </p>
                            </div>
                            <span style={{ background: '#a98225', color: '#FFFFFF', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, flexShrink: 0 }}>
                              #{acta.numero_acta}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ))
                )}

                {!cargandoB && !(resultados || borradores || []).length && (
                  <p style={{ color: '#6B6B6B', fontSize: 13, margin: '8px 0 0' }}>No hay actas en stand-by.</p>
                )}
              </div>
            )}

            {/* ── Tab: Diagnósticos ────────────────────────────── */}
            {tab === 'diagnosticos' && (
              <div className="s-card">
                <p style={{ color: '#6B6B6B', fontSize: 13, marginTop: 0, marginBottom: 14 }}>
                  El Técnico busca o abre un diagnóstico pendiente para completar la revisión.
                </p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input type="text" value={patente}
                    onChange={(e) => { setPatente(e.target.value.toUpperCase()); setResultados(null); setErrorBusq('') }}
                    onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
                    placeholder="Patente — ABCD12"
                    maxLength={8} autoCapitalize="characters"
                    className="s-input"
                    style={{ flex: 1, fontFamily: 'monospace', letterSpacing: '2px', padding: '13px 14px' }}
                  />
                  <button type="button" onClick={handleBuscar} disabled={buscando || !patente.trim()}
                    style={{
                      background: '#a98225', color: '#FFFFFF', fontWeight: 700, border: 'none',
                      borderRadius: 10, padding: '0 20px', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit',
                      opacity: buscando || !patente.trim() ? 0.4 : 1,
                    }}
                  >
                    {buscando ? <Spinner size={18} color="#FFFFFF" /> : 'Buscar'}
                  </button>
                </div>

                {errorBusq && <p style={{ color: '#FF453A', fontSize: 12, margin: '0 0 8px' }}>⚠ {errorBusq}</p>}

                {cargandoD ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 }}>
                    <Spinner /><span style={{ color: '#6B6B6B', fontSize: 14 }}>Cargando diagnósticos…</span>
                  </div>
                ) : (
                  agruparPorPatente(resultados || diagnosticos || [], patenteDeDiagnostico).map((grupo) => (
                    <div key={grupo.patente} style={{ marginTop: 12 }}>
                      <p style={{ color: '#a98225', fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', margin: '0 0 8px' }}>
                        {grupo.patente}
                      </p>
                      {grupo.items.map((diag) => (
                        <button key={diag.id} type="button" onClick={() => handleAbrirDiagnostico(diag)}
                          style={{
                            width: '100%', textAlign: 'left', background: 'rgba(169,130,37,0.06)',
                            border: '1px solid rgba(169,130,37,0.25)', borderRadius: 10, padding: 14,
                            cursor: 'pointer', marginBottom: 8, fontFamily: 'inherit',
                            opacity: abriendoDiag === diag.id ? 0.65 : 1,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 14, color: '#111114' }}>
                                {diag.actas?.vehiculos?.marca} {diag.actas?.vehiculos?.modelo}
                              </p>
                              <p style={{ margin: 0, fontSize: 12, color: '#6B6B6B' }}>
                                DG-{diag.numero_diagnostico} · {diag.status === 'proceso' ? 'Retomar diagnóstico' : 'Pendiente'}
                              </p>
                            </div>
                            <span style={{ background: diag.status === 'proceso' ? 'rgba(169,130,37,0.14)' : '#a98225', color: diag.status === 'proceso' ? '#a98225' : '#FFFFFF', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, flexShrink: 0 }}>
                              {diag.status}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ))
                )}

                {!cargandoD && !(resultados || diagnosticos || []).length && (
                  <p style={{ color: '#6B6B6B', fontSize: 13, margin: '8px 0 0' }}>Sin diagnósticos pendientes.</p>
                )}
              </div>
            )}

            {/* ── Tab: Presupuestos (solo admin) ───────────────── */}
            {tab === 'presupuestos' && puedeVerPresupuestos && (
              <div className="s-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <p style={{ color: '#6B6B6B', fontSize: 13, margin: 0, flex: 1, paddingRight: 12 }}>
                    Torre de Control convierte diagnósticos listos en cotizaciones y retoma presupuestos en curso.
                  </p>
                  {esAdmin && (
                    <button
                      type="button"
                      onClick={() => setShowNuevoPresupuesto(true)}
                      style={{ flexShrink: 0, background: '#a98225', color: '#FFFFFF', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      + Nuevo
                    </button>
                  )}
                </div>

                {cargandoP ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 }}>
                    <Spinner /><span style={{ color: '#6B6B6B', fontSize: 14 }}>Cargando presupuestos…</span>
                  </div>
                ) : (
                  <>
                    {!!diagnosticosListos?.length && (
                      <div style={{ marginBottom: 18 }}>
                        <p style={{ color: '#a98225', fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', margin: '0 0 8px' }}>
                          Diagnósticos listos para cotizar
                        </p>
                        {agruparPorPatente(diagnosticosListos, patenteDeDiagnostico).map((grupo) => (
                          <div key={grupo.patente} style={{ marginBottom: 8 }}>
                            <p style={{ color: '#6B6B6B', fontSize: 12, fontWeight: 700, margin: '0 0 6px' }}>{grupo.patente}</p>
                            {grupo.items.map((diag) => (
                              <button key={diag.id} type="button" onClick={() => handleCrearPresupuesto(diag)}
                                style={{
                                  width: '100%', textAlign: 'left', background: 'rgba(169,130,37,0.06)',
                                  border: '1px solid rgba(169,130,37,0.25)', borderRadius: 10, padding: 14,
                                  cursor: 'pointer', marginBottom: 8, fontFamily: 'inherit',
                                  opacity: abriendoP === diag.id ? 0.65 : 1,
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                  <div>
                                    <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 14, color: '#111114' }}>
                                      {diag.actas?.vehiculos?.marca} {diag.actas?.vehiculos?.modelo}
                                    </p>
                                    <p style={{ margin: 0, fontSize: 12, color: '#6B6B6B' }}>
                                      DG-{diag.numero_diagnostico} · {diag.tipo_mantencion || 'mantención'}
                                    </p>
                                  </div>
                                  <span style={{ background: '#a98225', color: '#FFFFFF', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, flexShrink: 0 }}>
                                    Cotizar
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}

                    <p style={{ color: '#a98225', fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', margin: '0 0 8px' }}>
                      Cotizaciones
                    </p>
                    {(presupuestos || []).map((cot) => {
                      const vehManual = cot.vista_cliente?.vehiculo_manual || {}
                      const vehLabel = `${cot.vehiculos?.marca || vehManual.marca || ''} ${cot.vehiculos?.modelo || vehManual.modelo || ''}`.trim() || 'Presupuesto sin asignar'
                      const patenteLabel = cot.vehiculos?.patente || vehManual.patente || 'SIN ASIGNAR'
                      const isUnassigned = cot.status === 'sin_asignar'
                      return (
                        <button key={cot.id} type="button" onClick={() => handleAbrirCotizacion(cot)}
                          style={{
                            width: '100%', textAlign: 'left', background: isUnassigned ? 'rgba(169,130,37,0.04)' : '#FFFFFF',
                            border: `1px solid ${isUnassigned ? 'rgba(169,130,37,0.25)' : '#E0E0E0'}`, borderRadius: 10, padding: 14,
                            cursor: 'pointer', marginBottom: 8, fontFamily: 'inherit',
                            opacity: abriendoP === cot.id ? 0.65 : 1,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                            <div>
                              <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 14, color: '#111114' }}>
                                {vehLabel}
                              </p>
                              <p style={{ margin: 0, fontSize: 12, color: '#6B6B6B' }}>
                                {patenteLabel} · COT-{cot.numero_cotizacion} · {(cot.tipo_presupuesto || cot.vista_cliente?.tipo_presupuesto) === 'inicial' ? 'Inicial' : 'Final'} · ${Number(cot.total || 0).toLocaleString('es-CL')}
                              </p>
                            </div>
                            <span style={{ background: cot.status === 'enviada' ? '#a98225' : isUnassigned ? '#111114' : 'rgba(169,130,37,0.12)', color: cot.status === 'enviada' || isUnassigned ? '#FFFFFF' : '#a98225', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, flexShrink: 0 }}>
                              {isUnassigned ? 'Sin asignar' : statusText(cot.status)}
                            </span>
                          </div>
                        </button>
                      )
                    })}

                    {!diagnosticosListos?.length && !presupuestos?.length && (
                      <p style={{ color: '#6B6B6B', fontSize: 13, margin: '8px 0 0' }}>No hay diagnósticos listos ni cotizaciones.</p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Tab: OTs ─────────────────────────────────────── */}
            {tab === 'ots' && (
              <div className="s-card">
                {cargandoOT ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 }}>
                    <Spinner /><span style={{ color: '#6B6B6B', fontSize: 14 }}>Cargando OTs…</span>
                  </div>
                ) : !ots?.length ? (
                  <p style={{ color: '#6B6B6B', fontSize: 13, margin: '8px 0 0', textAlign: 'center' }}>No hay OTs aún.</p>
                ) : (
                  ots.map((ot) => {
                    const veh = ot.vehiculos || ot.actas?.vehiculos || {}
                    const cli = ot.clientes || ot.actas?.clientes || {}
                    const sc = { generada: { bg: '#F5F5F5', color: '#6B6B6B' }, asignada: { bg: 'rgba(169,130,37,0.12)', color: '#a98225' }, en_proceso: { bg: 'rgba(80,100,200,0.12)', color: '#5064c8' }, finalizada: { bg: 'rgba(34,139,80,0.12)', color: '#228b50' }, entregada: { bg: '#228b50', color: '#FFFFFF' } }[ot.status] || { bg: '#F5F5F5', color: '#6B6B6B' }
                    return (
                      <button key={ot.id} type="button" onClick={() => handleAbrirOT(ot)}
                        style={{
                          width: '100%', textAlign: 'left', background: '#FFFFFF',
                          border: '1px solid #E0E0E0', borderRadius: 10, padding: 14,
                          cursor: 'pointer', marginBottom: 8, fontFamily: 'inherit',
                          opacity: abriendoOT === ot.id ? 0.65 : 1,
                        }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                          <div>
                            <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 14, color: '#111114' }}>
                              {veh.marca} {veh.modelo} · <span style={{ fontFamily: 'monospace', letterSpacing: '1px', fontSize: 12 }}>{veh.patente}</span>
                            </p>
                            <p style={{ margin: 0, fontSize: 12, color: '#6B6B6B' }}>
                              {ot.numero_ot ? `OT #${ot.numero_ot}` : 'OT'}{cli.nombre ? ` · ${cli.nombre}` : ''}{ot.tecnico_nombre ? ` · ${ot.tecnico_nombre}` : ''}
                            </p>
                          </div>
                          <span style={{ background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, flexShrink: 0 }}>
                            {ot.status}
                          </span>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            )}

            {/* ── Tab: Historial ─────────────────────────────────── */}
            {tab === 'historial' && puedeVerHistorial && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {cargandoH ? (
                  <div className="s-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 }}>
                    <Spinner /><span style={{ color: '#6B6B6B', fontSize: 14 }}>Cargando historial…</span>
                  </div>
                ) : !historial?.length ? (
                  <div className="s-card" style={{ textAlign: 'center', padding: 40 }}>
                    <p style={{ fontSize: 32, margin: '0 0 8px' }}>📭</p>
                    <p style={{ color: '#6B6B6B', fontSize: 14, margin: 0 }}>Sin actas ni diagnósticos aún</p>
                  </div>
                ) : (
                  <>
                    <div className="s-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div>
                          <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 16, color: '#111114' }}>Historial de atenciones</p>
                          <p style={{ margin: 0, fontSize: 13, color: '#6B6B6B', lineHeight: 1.45 }}>
                            Vehículos y documentos ordenados por fecha descendente.
                          </p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <span style={{ background: 'rgba(169,130,37,0.10)', color: '#a98225', fontWeight: 700, fontSize: 12, padding: '5px 10px', borderRadius: 8 }}>
                            {gruposHistorial.length} vehículo{gruposHistorial.length !== 1 ? 's' : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowFiltrosHistorial((v) => !v)}
                            style={{
                              border: '1px solid #E0E0E0',
                              background: showFiltrosHistorial ? 'rgba(169,130,37,0.08)' : '#FFFFFF',
                              color: showFiltrosHistorial ? '#a98225' : '#111114',
                              borderRadius: 8,
                              padding: '7px 10px',
                              fontSize: 12,
                              fontWeight: 800,
                              fontFamily: 'inherit',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Filtros{filtrosActivosHistorial ? ` (${filtrosActivosHistorial})` : ''} ▾
                          </button>
                        </div>
                      </div>

                      {showFiltrosHistorial && (
                        <div style={{
                          border: '1px solid #E0E0E0',
                          background: '#FAFAFA',
                          borderRadius: 10,
                          padding: 12,
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
                          gap: 10,
                        }}>
                          <div>
                            <p style={sModalLabel}>Fecha desde</p>
                            <input type="date" value={filtrosHistorial.fechaDesde} onChange={(e) => setFiltrosHistorial((f) => ({ ...f, fechaDesde: e.target.value }))} className="s-input" style={{ padding: '10px 12px' }} />
                          </div>
                          <div>
                            <p style={sModalLabel}>Fecha hasta</p>
                            <input type="date" value={filtrosHistorial.fechaHasta} onChange={(e) => setFiltrosHistorial((f) => ({ ...f, fechaHasta: e.target.value }))} className="s-input" style={{ padding: '10px 12px' }} />
                          </div>
                          <div>
                            <p style={sModalLabel}>Patente</p>
                            <input type="text" value={filtrosHistorial.patente} onChange={(e) => setFiltrosHistorial((f) => ({ ...f, patente: e.target.value.toUpperCase() }))} placeholder="ABCD12" className="s-input" style={{ padding: '10px 12px', fontFamily: 'monospace', letterSpacing: '1px' }} />
                          </div>
                          <div>
                            <p style={sModalLabel}>N° OT</p>
                            <input type="text" inputMode="numeric" value={filtrosHistorial.numeroOt} onChange={(e) => setFiltrosHistorial((f) => ({ ...f, numeroOt: e.target.value.replace(/\D/g, '') }))} placeholder="Ej: 24" className="s-input" style={{ padding: '10px 12px' }} />
                          </div>
                          <button type="button" onClick={() => setFiltrosHistorial(HISTORIAL_FILTERS_INICIAL)} style={{ border: '1px solid #E0E0E0', background: '#FFFFFF', color: '#6B6B6B', borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', minHeight: 40, alignSelf: 'end' }}>
                            Limpiar filtros
                          </button>
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                        <div style={{ background: '#FAFAFA', border: '1px solid #E0E0E0', borderRadius: 8, padding: 10 }}>
                          <p style={{ margin: '0 0 2px', color: '#6B6B6B', fontSize: 11 }}>Actas</p>
                          <p style={{ margin: 0, color: '#111114', fontSize: 18, fontWeight: 700 }}>{historialFiltrado.filter((i) => i.tipo === 'acta').length}</p>
                        </div>
                        <div style={{ background: '#FAFAFA', border: '1px solid #E0E0E0', borderRadius: 8, padding: 10 }}>
                          <p style={{ margin: '0 0 2px', color: '#6B6B6B', fontSize: 11 }}>Diagnósticos</p>
                          <p style={{ margin: 0, color: '#111114', fontSize: 18, fontWeight: 700 }}>{historialFiltrado.filter((i) => i.tipo === 'diagnostico').length}</p>
                        </div>
                        <div style={{ background: '#FAFAFA', border: '1px solid #E0E0E0', borderRadius: 8, padding: 10 }}>
                          <p style={{ margin: '0 0 2px', color: '#6B6B6B', fontSize: 11 }}>Cotizaciones</p>
                          <p style={{ margin: 0, color: '#111114', fontSize: 18, fontWeight: 700 }}>{historialFiltrado.filter((i) => i.tipo === 'cotizacion').length}</p>
                        </div>
                        <div style={{ background: '#FAFAFA', border: '1px solid #E0E0E0', borderRadius: 8, padding: 10 }}>
                          <p style={{ margin: '0 0 2px', color: '#6B6B6B', fontSize: 11 }}>Órdenes</p>
                          <p style={{ margin: 0, color: '#111114', fontSize: 18, fontWeight: 700 }}>{historialFiltrado.filter((i) => i.tipo === 'ot').length}</p>
                        </div>
                      </div>
                    </div>

                    {!gruposHistorial.length ? (
                      <div className="s-card" style={{ textAlign: 'center', padding: 28 }}>
                        <p style={{ color: '#6B6B6B', fontSize: 14, margin: 0 }}>No hay resultados para esa búsqueda.</p>
                      </div>
                    ) : agruparVehiculosPorMes(gruposHistorial).map((section) => (
                      <div key={section.mes} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <p style={{ margin: '4px 2px 0', color: '#a98225', fontSize: 11, fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
                          {section.mes}
                        </p>

                        {section.grupos.map((grupo) => {
                          const abierto = !!vehiculosAbiertos[grupo.patente]
                          const totalRegistros = grupo.registros.length
                          const cargandoGrupo = descargando === `grupo-${grupo.patente}`
                          const fecha = fechaAtencion(grupo.ultimaFecha)
                          const ultimo = grupo.registros[0]
                          return (
                            <div key={grupo.patente} className="s-card" style={{ padding: 0, overflow: 'hidden' }}>
                              <button
                                type="button"
                                onClick={() => toggleVehiculo(grupo.patente)}
                                style={{
                                  width: '100%',
                                  border: 'none',
                                  background: abierto ? 'rgba(169,130,37,0.04)' : '#FFFFFF',
                                  padding: 14,
                                  cursor: 'pointer',
                                  fontFamily: 'inherit',
                                  textAlign: 'left',
                                  display: 'grid',
                                  gridTemplateColumns: '72px 1fr auto',
                                  gap: 12,
                                  alignItems: 'center',
                                }}
                              >
                                <div style={{
                                  border: '1px solid rgba(169,130,37,0.28)',
                                  background: 'rgba(169,130,37,0.08)',
                                  borderRadius: 8,
                                  padding: '8px 6px',
                                  textAlign: 'center',
                                }}>
                                  <p style={{ margin: '0 0 2px', color: '#a98225', fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>{fecha.diaSemana}</p>
                                  <p style={{ margin: 0, color: '#111114', fontSize: 24, lineHeight: 1, fontWeight: 800 }}>{fecha.dia}</p>
                                  <p style={{ margin: '3px 0 0', color: '#6B6B6B', fontSize: 11, fontWeight: 700 }}>{fecha.mes}</p>
                                </div>

                                <div style={{ minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                                    <span style={{ fontFamily: 'monospace', letterSpacing: '1px', color: '#FFFFFF', background: '#111114', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 800 }}>
                                      {grupo.patente}
                                    </span>
                                    <span style={{ color: '#6B6B6B', fontSize: 12, fontWeight: 600 }}>
                                      {fecha.completa}
                                    </span>
                                  </div>
                                  <p style={{ margin: '0 0 3px', color: '#111114', fontSize: 15, fontWeight: 700, lineHeight: 1.25 }}>
                                    {grupo.vehiculo || 'Vehículo desconocido'}
                                  </p>
                                  <p style={{ margin: 0, color: '#6B6B6B', fontSize: 12, lineHeight: 1.4 }}>
                                    {grupo.cliente || 'Sin cliente'} · Último movimiento: {ultimo?.tipo === 'acta' ? 'Acta' : ultimo?.tipo === 'diagnostico' ? 'Diagnóstico' : ultimo?.tipo === 'ot' ? 'Orden de trabajo' : 'Presupuesto'} · {statusText(ultimo?.estado)}
                                  </p>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ background: '#F5F5F5', color: '#6B6B6B', border: '1px solid #E0E0E0', borderRadius: 8, padding: '5px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                                    {totalRegistros} registro{totalRegistros !== 1 ? 's' : ''}
                                  </span>
                                  <span style={{ color: '#a98225', fontSize: 16, transition: 'transform 200ms', display: 'inline-block', transform: abierto ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}>
                                    ▾
                                  </span>
                                </div>
                              </button>

                              {abierto && (
                                <div style={{ background: '#FAFAFA', borderTop: '1px solid #E0E0E0' }}>
                                  {(grupo.actas.length + grupo.cotizaciones.length) > 0 && (
                                    <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, borderBottom: '1px solid #EEEEEE' }}>
                                      <p style={{ margin: 0, color: '#6B6B6B', fontSize: 12 }}>
                                        Documentos disponibles: {grupo.actas.length + grupo.cotizaciones.length}
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() => handleDescargarTodo(grupo)}
                                        disabled={!!cargandoGrupo}
                                        style={{
                                          background: 'rgba(169,130,37,0.08)', color: '#a98225',
                                          border: '1.5px solid rgba(169,130,37,0.3)', borderRadius: 8,
                                          padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                          fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
                                          opacity: cargandoGrupo ? 0.5 : 1,
                                        }}
                                      >
                                        {cargandoGrupo ? <Spinner size={14} /> : '↓'}
                                        {cargandoGrupo ? 'Generando…' : 'Descargar ZIP'}
                                      </button>
                                    </div>
                                  )}

                                  {grupo.registros.map((item) => {
                                    const meta = {
                                      acta: {
                                        label: `Acta #${item.acta?.numero_acta || ''}`,
                                        title: 'Recepción cerrada',
                                        detail: item.acta?.km ? `${Number(item.acta.km).toLocaleString('es-CL')} km` : 'Ingreso completado',
                                        bg: 'rgba(169,130,37,0.12)',
                                        color: '#a98225',
                                      },
                                      diagnostico: {
                                        label: `DG-${item.diagnostico?.numero_diagnostico || ''}`,
                                        title: `Diagnóstico ${statusText(item.diagnostico?.status)}`,
                                        detail: item.diagnostico?.tipo_mantencion ? statusText(item.diagnostico.tipo_mantencion) : 'Revisión técnica',
                                        bg: 'rgba(80,100,200,0.12)',
                                        color: '#5064c8',
                                      },
                                      cotizacion: {
                                        label: `COT-${item.cotizacion?.numero_cotizacion || ''}`,
                                        title: `${(item.cotizacion?.tipo_presupuesto || item.cotizacion?.vista_cliente?.tipo_presupuesto) === 'inicial' ? 'Presupuesto inicial' : 'Presupuesto final'} ${statusText(item.cotizacion?.status)}`,
                                        detail: item.cotizacion?.status === 'sin_asignar' ? 'Sin acta ni vehículo asignado' : `$${Number(item.cotizacion?.total || 0).toLocaleString('es-CL')}`,
                                        bg: 'rgba(34,139,80,0.12)',
                                        color: '#228b50',
                                      },
                                      ot: {
                                        label: `OT-${item.ot?.numero_ot || ''}`,
                                        title: `Orden de trabajo ${statusText(item.ot?.status)}`,
                                        detail: item.ot?.tecnico_nombre ? `Responsable: ${item.ot.tecnico_nombre}` : 'Orden de trabajo',
                                        bg: 'rgba(80,100,200,0.12)',
                                        color: '#5064c8',
                                      },
                                    }[item.tipo]
                                    return (
                                      <div key={`${item.tipo}-${item.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: '1px solid #EEEEEE' }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                                            <span style={{ background: meta.bg, color: meta.color, fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 5, flexShrink: 0 }}>
                                              {meta.label}
                                            </span>
                                            <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#111114' }}>{meta.title}</p>
                                          </div>
                                          <p style={{ margin: 0, fontSize: 11, color: '#6B6B6B' }}>
                                            {fechaAtencion(item.fecha).completa || ''} · {meta.detail}
                                          </p>
                                        </div>

                                        {item.tipo === 'acta' && (
                                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                            <button type="button" onClick={() => handleVisualizar(item.acta)} disabled={!!cargandoVisualizacion}
                                              style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1.5px solid #E0E0E0', background: '#FFFFFF', color: '#111114', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, opacity: cargandoVisualizacion === item.acta.id ? 0.5 : 1, whiteSpace: 'nowrap' }}
                                              title="Visualizar acta"
                                            >
                                              {cargandoVisualizacion === item.acta.id ? <Spinner size={13} /> : null} Ver
                                            </button>
                                            <button type="button" onClick={() => handleDescargar(item.acta)} disabled={descargando === item.acta.id}
                                              style={{ width: 38, height: 38, borderRadius: 8, border: '1.5px solid #a98225', background: '#FFFFFF', color: '#a98225', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: descargando === item.acta.id ? 0.5 : 1 }}
                                              title="Descargar PDF"
                                            >
                                              {descargando === item.acta.id ? <Spinner size={14} /> : '↓'}
                                            </button>
                                          </div>
                                        )}

                                        {item.tipo === 'cotizacion' && (
                                          <button type="button" onClick={() => handleDescargarCotizacion(item.cotizacion)} disabled={descargando === `cot-${item.cotizacion.id}`}
                                            style={{ minWidth: 38, height: 38, borderRadius: 8, border: '1.5px solid #228b50', background: '#FFFFFF', color: '#228b50', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: descargando === `cot-${item.cotizacion.id}` ? 0.5 : 1 }}
                                            title="Descargar PDF Cotización"
                                          >
                                            {descargando === `cot-${item.cotizacion.id}` ? <Spinner size={14} /> : '↓'}
                                          </button>
                                        )}

                                        {item.tipo === 'diagnostico' && <div style={{ width: 38, flexShrink: 0 }} />}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <p style={{ color: '#AAAAAA', fontSize: 12, textAlign: 'center', paddingBottom: 24 }}>
        SECCO · Taller Mecánico
      </p>

      {/* ── Modal: Nuevo presupuesto manual ────────────── */}
      {showNuevoPresupuesto && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowNuevoPresupuesto(false) }}
        >
          <div style={{ background: '#FFFFFF', borderRadius: '20px 20px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 480, boxShadow: '0 -8px 32px rgba(0,0,0,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111114' }}>Nuevo presupuesto</p>
              <button type="button" onClick={() => setShowNuevoPresupuesto(false)}
                style={{ background: '#F5F5F5', border: 'none', borderRadius: 8, width: 32, height: 32, fontSize: 18, cursor: 'pointer', color: '#6B6B6B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            <p style={{ margin: '0 0 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#a98225' }}>Vehículo preliminar (opcional)</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <p style={sModalLabel}>Marca</p>
                <input
                  type="text"
                  value={datosManuales.marca}
                  onChange={(e) => setDatosManuales((d) => ({ ...d, marca: e.target.value }))}
                  placeholder="Toyota"
                  style={sModalInput}
                />
              </div>
              <div>
                <p style={sModalLabel}>Modelo</p>
                <input
                  type="text"
                  value={datosManuales.modelo}
                  onChange={(e) => setDatosManuales((d) => ({ ...d, modelo: e.target.value }))}
                  placeholder="Corolla"
                  style={sModalInput}
                />
              </div>
              <div>
                <p style={sModalLabel}>Patente</p>
                <input
                  type="text"
                  value={datosManuales.patente}
                  onChange={(e) => setDatosManuales((d) => ({ ...d, patente: e.target.value.toUpperCase() }))}
                  placeholder="ABCD12"
                  maxLength={8}
                  autoCapitalize="characters"
                  style={{ ...sModalInput, fontFamily: 'monospace', letterSpacing: '2px' }}
                />
              </div>
              <div>
                <p style={sModalLabel}>Año</p>
                <input
                  type="number"
                  value={datosManuales.anio}
                  onChange={(e) => setDatosManuales((d) => ({ ...d, anio: e.target.value }))}
                  placeholder="2020"
                  min="1950" max="2030"
                  style={sModalInput}
                />
              </div>
            </div>

            <p style={{ margin: '16px 0 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#6B6B6B' }}>Cliente (opcional)</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
              <div>
                <p style={sModalLabel}>Nombre</p>
                <input
                  type="text"
                  value={datosManuales.nombre}
                  onChange={(e) => setDatosManuales((d) => ({ ...d, nombre: e.target.value }))}
                  placeholder="Juan Pérez"
                  style={sModalInput}
                />
              </div>
              <div>
                <p style={sModalLabel}>Teléfono</p>
                <input
                  type="tel"
                  value={datosManuales.telefono}
                  onChange={(e) => setDatosManuales((d) => ({ ...d, telefono: e.target.value }))}
                  placeholder="+56 9 1234 5678"
                  style={sModalInput}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleCrearPresupuestoManual}
              disabled={creandoManual}
              style={{ width: '100%', padding: '14px', background: '#a98225', color: '#FFFFFF', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: creandoManual ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {creandoManual ? <><Spinner size={18} color="#FFFFFF" /> Creando…</> : 'Crear presupuesto sin asignar'}
            </button>
          </div>
        </div>
      )}

      {actaVisualizando && (
        <ModalVisualizarActa
          acta={actaVisualizando}
          onClose={() => setActaVisualizando(null)}
          onDescargar={() => handleDescargar(actaVisualizando)}
          descargando={descargando === actaVisualizando.id}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

const sModalLabel = { margin: '0 0 4px', fontSize: 11, color: '#6B6B6B', fontWeight: 600 }
const sModalInput = { width: '100%', boxSizing: 'border-box', fontSize: 14, border: '1px solid #E0E0E0', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', outline: 'none', color: '#111114', background: '#FAFAFA' }

// ─── ActaForm ─────────────────────────────────────────────────
function ActaForm({ onVolver }) {
  const { formData, updateForm } = useForm()
  const [seccion, setSeccion] = useState(formData.acta_id ? 3 : 1)
  const [loading, setLoading] = useState(false)
  const [guardandoBorrador, setGuardandoBorrador] = useState(false)
  const [actaGuardada, setActaGuardada] = useState(false)
  const [error, setError] = useState(null)
  const [presupuestosSinAsignar, setPresupuestosSinAsignar] = useState([])
  const [cargandoPresupuestos, setCargandoPresupuestos] = useState(false)
  const [asignandoPresupuesto, setAsignandoPresupuesto] = useState(null)
  const [creandoPresupuestoInicial, setCreandoPresupuestoInicial] = useState(false)

  useEffect(() => {
    if (seccion !== 5 || !supabaseConfigurado()) return
    setCargandoPresupuestos(true)
    listarCotizacionesSinAsignar(30)
      .then(setPresupuestosSinAsignar)
      .catch(() => setPresupuestosSinAsignar([]))
      .finally(() => setCargandoPresupuestos(false))
  }, [seccion])

  function scrollTop() { window.scrollTo({ top: 0, behavior: 'smooth' }) }
  function back() { setSeccion((s) => Math.max(s - 1, 1)); scrollTop() }

  async function handleNextFromS2() {
    if (!supabaseConfigurado()) { setSeccion(3); scrollTop(); return }
    setGuardandoBorrador(true)
    try {
      const { acta, cliente, vehiculo } = await guardarBorrador(formData)
      updateForm({ acta_id: acta.id, numero_acta: acta.numero_acta, cliente_id: cliente.id, vehiculo_id: vehiculo.id })
      await notificarIngresoActa({ ...acta, clientes: cliente, vehiculos: vehiculo })
    } catch (e) { console.warn('Borrador no guardado:', e.message) }
    finally { setGuardandoBorrador(false); setSeccion(3); scrollTop() }
  }

  async function ensureActaBorrador() {
    if (formData.acta_id && formData.vehiculo_id) {
      return {
        acta: { id: formData.acta_id, numero_acta: formData.numero_acta },
        vehiculo: { id: formData.vehiculo_id },
        cliente: { id: formData.cliente_id },
      }
    }
    const result = await guardarBorrador(formData)
    updateForm({
      acta_id: result.acta.id,
      numero_acta: result.acta.numero_acta,
      cliente_id: result.cliente.id,
      vehiculo_id: result.vehiculo.id,
    })
    return result
  }

  async function handleAsignarPresupuesto(cotizacionId) {
    if (!cotizacionId || !supabaseConfigurado()) return
    setAsignandoPresupuesto(cotizacionId)
    setError(null)
    try {
      const { acta, cliente, vehiculo } = await ensureActaBorrador()
      const asignada = await asignarCotizacionAActa(cotizacionId, {
        actaId: acta.id,
        vehiculoId: vehiculo.id,
        clienteId: cliente.id,
      })
      updateForm({ presupuesto_inicial_id: asignada.id })
      setPresupuestosSinAsignar((rows) => rows.filter((row) => row.id !== cotizacionId))
    } catch (e) {
      setError(`No se pudo asignar el presupuesto: ${e.message}`)
    } finally {
      setAsignandoPresupuesto(null)
    }
  }

  async function handleCrearPresupuestoInicial() {
    if (!supabaseConfigurado()) return
    setCreandoPresupuestoInicial(true)
    setError(null)
    try {
      const { acta, cliente, vehiculo } = await ensureActaBorrador()
      const nueva = await crearCotizacionManual({
        marca: formData.marca,
        modelo: formData.modelo,
        patente: formData.patente,
        anio: formData.anio,
        nombre: formData.nombre,
        telefono: formData.telefono,
      })
      const asignada = await asignarCotizacionAActa(nueva.id, {
        actaId: acta.id,
        vehiculoId: vehiculo.id,
        clienteId: cliente.id,
      })
      updateForm({ presupuesto_inicial_id: asignada.id })
      setPresupuestosSinAsignar((rows) => rows.filter((row) => row.id !== nueva.id))
    } catch (e) {
      setError(`No se pudo crear el presupuesto inicial: ${e.message}`)
    } finally {
      setCreandoPresupuestoInicial(false)
    }
  }

  function next() {
    if (seccion === 2) handleNextFromS2()
    else { setSeccion((s) => Math.min(s + 1, 8)); scrollTop() }
  }

  async function subirFotosActa(actaId) {
    const fotos = formData.fotos || {}
    const singleKeys = ['frontal', 'trasera', 'lateral_izq', 'lateral_der']

    if (formData.foto_km instanceof File) await subirFoto(actaId, 'km', formData.foto_km)
    if (formData.foto_combustible instanceof File) await subirFoto(actaId, 'combustible', formData.foto_combustible)

    for (const key of singleKeys) {
      const file = fotos[`${key}_file`]
      if (file instanceof File) await subirFoto(actaId, key, file)
    }

    for (const key of ['danos', 'interior']) {
      const items = Array.isArray(fotos[key])
        ? fotos[key]
        : (fotos[key] ? [{ file: fotos[`${key}_file`], preview: fotos[key] }] : [])
      for (const item of items) {
        if (item?.file instanceof File) await subirFoto(actaId, key, item.file)
      }
    }
  }

  async function handleFinish() {
    setLoading(true); setError(null)
    try {
      let actaId = formData.acta_id
      let numeroActa = formData.numero_acta
      if (supabaseConfigurado()) {
        if (!formData.patente || !formData.marca) {
          throw new Error('Faltan datos del vehículo. Vuelve a la sección de identificación del vehículo.')
        }
        // Garantiza que el acta exista en BD y esté vinculada al vehículo antes de cerrar.
        // Si el borrador no se creó en S2 (falla de red, etc.), lo crea ahora y lanza error visible si falla.
        const { acta } = await ensureActaBorrador()
        actaId = acta.id
        numeroActa = acta.numero_acta || formData.numero_acta

        await actualizarActa(actaId, {
          tecnico_nombre: formData.nombre_responsable,
          tc_nombre: formData.nombre_responsable,
          fecha_ingreso: formData.fecha_ingreso,
          hora_ingreso: formData.hora_ingreso,
          km: Number(formData.kilometraje),
          combustible: formData.combustible,
          llaves: Number(formData.llaves),
          documentacion: [...(formData.documentacion || [])],
          estado_exterior: formData.estado_exterior,
          detalle_exterior: formData.detalle_exterior || null,
          estado_interior: formData.estado_interior,
          detalle_interior: formData.detalle_interior || null,
          trabajo_solicitado: formData.trabajo_solicitado,
          acepta_declaracion: !!formData.acepta_declaracion,
          acepta_responsabilidad_objetos: !!formData.acepta_responsabilidad_objetos,
          acepta_pruebas_ruta: !!formData.acepta_pruebas_ruta,
          checklist_completo: true,
          status: 'cerrada',
        })

        try { await crearDiagnostico(actaId, formData.patente) }
        catch (e) { console.warn('Diagnóstico no creado:', e.message) }

        try {
          const actaCompleta = await cargarActaCompleta(actaId)
          await notificarIngresoActa(actaCompleta)
        } catch (e) { console.warn('Correo de ingreso no procesado:', e.message) }

        try { await subirFotosActa(actaId) }
        catch (e) { console.warn('Fotos del acta no subidas:', e.message) }

        try {
          if (formData.firma_cliente) await subirFotoBase64(actaId, 'firma_cliente', formData.firma_cliente)
          if (formData.firma_secco)   await subirFotoBase64(actaId, 'firma_secco',   formData.firma_secco)
        } catch { /* firmas opcionales */ }
      }
      await generarPDFActa({ ...formData, acta_id: actaId, numero_acta: numeroActa })
      setActaGuardada(true)
    } catch (e) {
      console.error(e)
      setError(`Error al procesar el acta: ${e.message}`)
    } finally { setLoading(false) }
  }

  // ── Pantalla de éxito ──
  if (actaGuardada) {
    return (
      <div className="fade-in" style={{ minHeight: '100svh', background: '#FFFFFF', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(169,130,37,0.10)', border: '2px solid #a98225', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, marginBottom: 24, color: '#a98225' }}>
          ✓
        </div>
        <h2 style={{ color: '#111114', fontSize: 22, fontWeight: 600, textAlign: 'center', margin: '0 0 8px' }}>Acta completada</h2>
        <p style={{ color: '#6B6B6B', fontSize: 14, textAlign: 'center', margin: '0 0 32px' }}>El PDF se descargó automáticamente.</p>

        <div className="s-card" style={{ width: '100%', maxWidth: 380, marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 16, color: '#111114' }}>
                {formData.marca} {formData.modelo}
              </p>
              <p style={{ margin: 0, fontSize: 13, color: '#6B6B6B' }}>
                {formData.patente} · {formData.anio}
              </p>
            </div>
            {formData.numero_acta && (
              <span style={{ background: '#a98225', color: '#FFFFFF', fontWeight: 700, fontSize: 12, padding: '4px 10px', borderRadius: 8 }}>
                #{formData.numero_acta}
              </span>
            )}
          </div>
          <div style={{ borderTop: '1px solid #E0E0E0', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              ['Cliente',      formData.nombre],
              ['Fecha',        new Date(formData.fecha_ingreso + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })],
              ['Kilometraje',  `${Number(formData.kilometraje).toLocaleString('es-CL')} km`],
              ['Responsable',  formData.nombre_responsable],
            ].map(([k, v]) => (
              <p key={k} style={{ margin: 0, fontSize: 13, color: '#6B6B6B' }}>
                <span style={{ color: '#111114', fontWeight: 500 }}>{k}:</span> {v}
              </p>
            ))}
          </div>
        </div>

        <button type="button" onClick={onVolver} className="s-btn-primary" style={{ maxWidth: 380, width: '100%' }}>
          Volver al inicio
        </button>
      </div>
    )
  }

  // ── Formulario ──
  return (
    <div style={{ minHeight: '100svh', background: '#FFFFFF' }}>
      <div style={{
        background: '#FFFFFF', borderBottom: '1px solid #E0E0E0',
        padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <button type="button" onClick={onVolver}
          style={{ background: '#F5F5F5', border: '1px solid #E0E0E0', color: '#111114', borderRadius: 8, width: 36, height: 36, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >←</button>
        <img src="/logo-secco.png" alt="SECCO"
          style={{ height: 28, objectFit: 'contain' }}
          onError={(e) => { e.target.style.display = 'none' }}
        />
        <div style={{ flex: 1 }} />
        {(formData.numero_acta || formData.patente) && (
          <span style={{ background: 'rgba(169,130,37,0.10)', color: '#a98225', fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 8, fontFamily: 'monospace', border: '1px solid rgba(169,130,37,0.25)' }}>
            {formData.numero_acta ? `#${formData.numero_acta}` : formData.patente}
          </span>
        )}
      </div>

      {guardandoBorrador && (
        <div style={{ background: 'rgba(169,130,37,0.07)', borderBottom: '1px solid rgba(169,130,37,0.2)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Spinner size={14} /><p style={{ color: '#a98225', fontSize: 12, fontWeight: 500, margin: 0 }}>Guardando borrador en la nube…</p>
        </div>
      )}

      <ProgressBar seccionActual={seccion} />

      <div style={{ paddingTop: 24, paddingBottom: 40 }}>
        {seccion === 1 && <Section1_Cliente onNext={next} />}
        {seccion === 2 && <Section2_Vehiculo onNext={next} onBack={back} />}
        {seccion === 3 && <Section3_Ingreso onNext={next} onBack={back} />}
        {seccion === 4 && <Section4_EstadoVehiculo onNext={next} onBack={back} />}
        {seccion === 5 && (
          <Section5_TrabajoSolicitado
            onNext={next}
            onBack={back}
            presupuestosSinAsignar={presupuestosSinAsignar}
            cargandoPresupuestos={cargandoPresupuestos}
            asignandoPresupuesto={asignandoPresupuesto}
            presupuestoSeleccionadoId={formData.presupuesto_inicial_id}
            onAsignarPresupuesto={handleAsignarPresupuesto}
            creandoPresupuestoInicial={creandoPresupuestoInicial}
            onCrearPresupuestoInicial={handleCrearPresupuestoInicial}
          />
        )}
        {seccion === 6 && <Section6_FirmaCliente onNext={next} onBack={back} />}
        {seccion === 7 && <Section7_RecepcionSECCO onNext={next} onBack={back} />}
        {seccion === 8 && <Section8_Checklist onFinish={handleFinish} onBack={back} loading={loading} />}
      </div>

      {error && (
        <div style={{
          position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 50,
          background: '#FF453A', color: '#FFFFFF', borderRadius: 14, padding: '14px 16px',
          display: 'flex', alignItems: 'flex-start', gap: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        }}>
          <span style={{ flexShrink: 0 }}>⚠️</span>
          <p style={{ margin: 0, fontSize: 14, flex: 1 }}>{error}</p>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#FFFFFF', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────
function Root() {
  const { usuario, cargando: cargandoAuth } = useAuth()
  const { resetForm, cargarDesdeActa } = useForm()
  const { resetDiagnostico, cargarDesdeDiagnostico } = useDiagnostico()
  const [vista, setVista] = useState('home')
  const [cotizacionActiva, setCotizacionActiva] = useState(null)
  const [otActiva, setOtActiva] = useState(null)

  function handleNueva()          { resetForm(); setVista('form') }
  function handleRetomarActa(acta){ cargarDesdeActa(acta); setVista('form') }
  function handleAbrirDiagnostico(diagnostico) {
    cargarDesdeDiagnostico(diagnostico)
    setVista('diagnostico')
  }
  function handleAbrirPresupuesto(cotizacion) {
    setCotizacionActiva(cotizacion)
    setVista('presupuesto')
  }
  function handleAbrirOT(ot) {
    setOtActiva(ot)
    setVista('ot')
  }
  function handleVolver() {
    resetForm(); resetDiagnostico()
    setCotizacionActiva(null); setOtActiva(null)
    setVista('home')
  }

  // Pantalla de carga mientras se inicializa la sesión
  if (cargandoAuth) {
    return (
      <div style={{ minHeight: '100svh', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <Spinner size={32} />
        <p style={{ color: '#6B6B6B', fontSize: 14, margin: 0 }}>Iniciando sesión…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // Pantalla de login si no hay sesión activa
  if (!usuario) return <LoginScreen />

  if (vista === 'form') return <ActaForm onVolver={handleVolver} />
  if (vista === 'diagnostico') return <DiagnosticoForm onVolver={handleVolver} />
  if (vista === 'presupuesto') return <PresupuestoForm cotizacionInicial={cotizacionActiva} onVolver={handleVolver} onAbrirOT={handleAbrirOT} />
  if (vista === 'ot') return <OTForm otInicial={otActiva} onVolver={handleVolver} />
  if (vista === 'tecnico') return <TecnicoScreen onVolver={handleVolver} />
  return <HomeScreen onNueva={handleNueva} onRetomarActa={handleRetomarActa} onAbrirDiagnostico={handleAbrirDiagnostico} onAbrirPresupuesto={handleAbrirPresupuesto} onAbrirOT={handleAbrirOT} onTecnicos={() => setVista('tecnico')} />
}

export default function App() {
  return (
    <AuthProvider>
      <FormProvider>
        <DiagnosticoProvider>
          <Root />
        </DiagnosticoProvider>
      </FormProvider>
    </AuthProvider>
  )
}
