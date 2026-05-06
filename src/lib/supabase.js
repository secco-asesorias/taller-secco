import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase no configurado. Agrega VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY al archivo .env'
  )
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
)

// Retorna true si Supabase está realmente configurado
export function supabaseConfigurado() {
  return !!(supabaseUrl && supabaseAnonKey &&
    !supabaseUrl.includes('placeholder') &&
    !supabaseAnonKey.includes('placeholder'))
}

// --- Clientes ---
export async function upsertCliente(datos) {
  const { data, error } = await supabase
    .from('clientes')
    .upsert(datos, { onConflict: 'rut' })
    .select()
    .single()
  if (error) throw error
  return data
}

// --- Vehículos ---
export async function upsertVehiculo(datos) {
  const { data, error } = await supabase
    .from('vehiculos')
    .upsert(datos, { onConflict: 'patente' })
    .select()
    .single()
  if (error) throw error
  return data
}

// --- Actas ---
export async function crearActa(datos) {
  if (!datos?.vehiculo_id) {
    throw new Error('No se puede crear un acta sin vehículo asociado.')
  }
  const { data, error } = await supabase
    .from('actas')
    .insert(datos)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function actualizarActa(id, datos) {
  if ('vehiculo_id' in datos && !datos.vehiculo_id) {
    throw new Error('No se puede guardar un acta sin vehículo asociado.')
  }
  const { data, error } = await supabase
    .from('actas')
    .update({ ...datos, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Guarda cliente + vehículo + acta como borrador (llamado al pasar S2→S3)
export async function guardarBorrador(formData) {
  const cliente = await upsertCliente({
    nombre: formData.nombre,
    rut: formData.rut,
    telefono: formData.telefono,
    email: formData.email,
  })

  const vehiculo = await upsertVehiculo({
    marca: formData.marca,
    modelo: formData.modelo,
    anio: formData.anio,
    patente: formData.patente,
    vin: formData.vin || null,
    color: formData.color || null,
    cliente_id: cliente.id,
  })

  // Si ya existe un borrador abierto para este vehículo, lo reutilizamos
  const { data: existente } = await supabase
    .from('actas')
    .select('id, numero_acta')
    .eq('vehiculo_id', vehiculo.id)
    .eq('status', 'borrador')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existente) {
    return { acta: existente, cliente, vehiculo, reutilizado: true }
  }

  const acta = await crearActa({
    vehiculo_id: vehiculo.id,
    cliente_id: cliente.id,
    fecha_ingreso: formData.fecha_ingreso,
    hora_ingreso: formData.hora_ingreso,
    km: 0,
    combustible: 'pendiente',
    status: 'borrador',
    checklist_completo: false,
  })

  return { acta, cliente, vehiculo, reutilizado: false }
}

// Busca borradores activos por patente
export async function buscarBorradorPorPatente(patente) {
  const patenteNorm = patente.trim().toUpperCase()

  const { data: vehiculo, error: vErr } = await supabase
    .from('vehiculos')
    .select('id, marca, modelo, anio, patente, color')
    .ilike('patente', patenteNorm)
    .single()

  if (vErr || !vehiculo) return []

  const { data: actas, error: aErr } = await supabase
    .from('actas')
    .select(`
      id,
      numero_acta,
      fecha_ingreso,
      hora_ingreso,
      status,
      created_at,
      cliente_id,
      vehiculo_id,
      clientes (id, nombre, rut, telefono, email),
      vehiculos (id, marca, modelo, anio, patente, vin, color)
    `)
    .eq('vehiculo_id', vehiculo.id)
    .eq('status', 'borrador')
    .order('created_at', { ascending: false })

  if (aErr) throw aErr
  return actas || []
}

// Lista los últimos borradores (para mostrar en pantalla de inicio)
export async function listarBorradoresRecientes(limite = 5) {
  const { data, error } = await supabase
    .from('actas')
    .select(`
      id,
      numero_acta,
      fecha_ingreso,
      hora_ingreso,
      status,
      created_at,
      cliente_id,
      vehiculo_id,
      clientes (id, nombre, rut, telefono, email),
      vehiculos (id, marca, modelo, anio, patente, vin, color)
    `)
    .eq('status', 'borrador')
    .order('created_at', { ascending: false })
    .limit(limite)

  if (error) throw error
  return data || []
}

// Lista actas para el panel de historial/documentos
export async function listarActasCerradas(limite = 30) {
  const { data, error } = await supabase
    .from('actas')
    .select(`
      id,
      numero_acta,
      fecha_ingreso,
      hora_ingreso,
      status,
      created_at,
      updated_at,
      km,
      combustible,
      tecnico_nombre,
      tc_nombre,
      cliente_id,
      vehiculo_id,
      clientes (id, nombre, rut, email, telefono),
      vehiculos (id, marca, modelo, patente, anio, color)
    `)
    .not('vehiculo_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(limite)

  if (error) throw error
  return data || []
}

// Carga todos los datos de un acta cerrada para regenerar el PDF
export async function cargarActaCompleta(actaId) {
  const { data, error } = await supabase
    .from('actas')
    .select(`
      *,
      clientes (*),
      vehiculos (*),
      fotos_acta (tipo, url)
    `)
    .eq('id', actaId)
    .single()

  if (error) throw error
  return data
}

// Mapea los datos del acta desde Supabase al formato que espera generarPDFActa
export function mapearActaParaPDF(acta) {
  const fotosMap = {}
  for (const f of acta.fotos_acta || []) {
    if (['interior', 'danos'].includes(f.tipo)) {
      fotosMap[f.tipo] = [...(Array.isArray(fotosMap[f.tipo]) ? fotosMap[f.tipo] : []), f.url]
    } else {
      fotosMap[f.tipo] = f.url
    }
  }

  return {
    // Cliente
    nombre: acta.clientes?.nombre,
    rut: acta.clientes?.rut,
    telefono: acta.clientes?.telefono,
    email: acta.clientes?.email,
    nombre_cliente: acta.clientes?.nombre,
    // Vehículo
    marca: acta.vehiculos?.marca,
    modelo: acta.vehiculos?.modelo,
    anio: acta.vehiculos?.anio,
    patente: acta.vehiculos?.patente,
    vin: acta.vehiculos?.vin,
    color: acta.vehiculos?.color,
    // Ingreso
    fecha_ingreso: acta.fecha_ingreso,
    hora_ingreso: acta.hora_ingreso?.slice(0, 5),
    kilometraje: acta.km,
    combustible: acta.combustible,
    llaves: acta.llaves,
    documentacion: acta.documentacion || [],
    foto_km_preview: fotosMap['km'],
    foto_combustible_preview: fotosMap['combustible'],
    // Estado
    estado_exterior: acta.estado_exterior,
    detalle_exterior: acta.detalle_exterior,
    estado_interior: acta.estado_interior,
    detalle_interior: acta.detalle_interior,
    fotos: {
      frontal: fotosMap['frontal'],
      trasera: fotosMap['trasera'],
      lateral_izq: fotosMap['lateral_izq'],
      lateral_der: fotosMap['lateral_der'],
      interior: fotosMap['interior'],
      danos: fotosMap['danos'],
    },
    // Trabajo
    trabajo_solicitado: acta.trabajo_solicitado,
    acepta_declaracion: acta.acepta_declaracion,
    acepta_responsabilidad_objetos: acta.acepta_responsabilidad_objetos,
    acepta_pruebas_ruta: acta.acepta_pruebas_ruta,
    // Firmas
    firma_cliente: fotosMap['firma_cliente'] || acta.firma_cliente_url,
    firma_secco: fotosMap['firma_secco'] || acta.firma_secco_url,
    nombre_responsable: acta.tecnico_nombre,
    cargo_responsable: acta.tc_nombre,
    fecha_firma_cliente: acta.fecha_ingreso,
    fecha_firma_secco: acta.fecha_ingreso,
    // Meta
    acta_id: acta.id,
    numero_acta: acta.numero_acta,
  }
}

// --- Fotos ---
export async function subirFoto(actaId, tipo, archivo) {
  const ext = archivo.name.split('.').pop()
  const path = `actas/${actaId}/${tipo}_${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('fotos-actas')
    .upload(path, archivo, { upsert: true })

  if (uploadError) throw uploadError

  const { data: urlData } = supabase.storage
    .from('fotos-actas')
    .getPublicUrl(path)

  const { error: dbError } = await supabase.from('fotos_acta').insert({
    acta_id: actaId,
    tipo,
    url: urlData.publicUrl,
  })

  if (dbError) throw dbError
  return urlData.publicUrl
}

export async function subirFotoBase64(actaId, tipo, base64Data) {
  const blob = await fetch(base64Data).then((r) => r.blob())
  const path = `actas/${actaId}/${tipo}_${Date.now()}.png`

  const { error: uploadError } = await supabase.storage
    .from('fotos-actas')
    .upload(path, blob, { contentType: 'image/png', upsert: true })

  if (uploadError) throw uploadError

  const { data: urlData } = supabase.storage
    .from('fotos-actas')
    .getPublicUrl(path)

  const { error: dbError } = await supabase.from('fotos_acta').insert({
    acta_id: actaId,
    tipo,
    url: urlData.publicUrl,
  })

  if (dbError) throw dbError
  return urlData.publicUrl
}

// --- Diagnósticos ---
export async function crearDiagnostico(actaId, patente) {
  const { data: existente } = await supabase
    .from('diagnosticos')
    .select('*')
    .eq('acta_id', actaId)
    .in('status', ['pendiente', 'proceso'])
    .order('fecha_creacion', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existente) return existente

  const { data, error } = await supabase
    .from('diagnosticos')
    .insert({
      acta_id: actaId,
      nombre: `Diagnóstico - ${patente}`,
      status: 'pendiente',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function buscarDiagnosticoPorPatente(patente) {
  const patenteNorm = patente.trim().toUpperCase()
  if (!patenteNorm) return []

  const { data: vehiculo, error: vErr } = await supabase
    .from('vehiculos')
    .select('id')
    .ilike('patente', patenteNorm)
    .maybeSingle()

  if (vErr || !vehiculo) return []

  const { data: actas, error: aErr } = await supabase
    .from('actas')
    .select('id')
    .eq('vehiculo_id', vehiculo.id)

  if (aErr) throw aErr
  const actaIds = (actas || []).map((a) => a.id)
  if (!actaIds.length) return []

  const { data, error } = await supabase
    .from('diagnosticos')
    .select(`
      *,
      actas (
        id,
        numero_acta,
        fecha_ingreso,
        km,
        trabajo_solicitado,
        tecnico_nombre,
        clientes (id, nombre, telefono),
        vehiculos (id, marca, modelo, anio, patente, vin, color)
      )
    `)
    .in('acta_id', actaIds)
    .in('status', ['pendiente', 'proceso'])
    .order('fecha_creacion', { ascending: false })

  if (error) throw error
  return data || []
}

export async function listarDiagnosticos(limite = 30) {
  const { data, error } = await supabase
    .from('diagnosticos')
    .select(`
      *,
      actas (
        id,
        numero_acta,
        fecha_ingreso,
        km,
        trabajo_solicitado,
        tecnico_nombre,
        clientes (id, nombre, telefono),
        vehiculos (id, marca, modelo, anio, patente, vin, color)
      )
    `)
    .order('fecha_creacion', { ascending: false })
    .limit(limite)

  if (error) throw error
  return data || []
}

export async function cargarDiagnosticoCompleto(diagnosticoId) {
  const { data, error } = await supabase
    .from('diagnosticos')
    .select(`
      *,
      actas (
        *,
        clientes (*),
        vehiculos (*)
      ),
      diagnostico_checklist (*),
      diagnostico_fotos (*),
      diagnostico_repuestos (*)
    `)
    .eq('id', diagnosticoId)
    .single()

  if (error) throw error
  return data
}

export async function guardarChecklist(diagnosticoId, items) {
  if (!items?.length) return []

  const rows = items.map((it) => ({
    diagnostico_id: diagnosticoId,
    seccion: it.seccion,
    item: it.item,
    estado: it.estado || 'ok',
    observacion: it.observacion || null,
  }))

  const { data, error } = await supabase
    .from('diagnostico_checklist')
    .upsert(rows, { onConflict: 'diagnostico_id,seccion,item' })
    .select()

  if (error) throw error
  return data || []
}

export async function guardarRepuestos(diagnosticoId, repuestos) {
  const { error: delError } = await supabase
    .from('diagnostico_repuestos')
    .delete()
    .eq('diagnostico_id', diagnosticoId)

  if (delError) throw delError
  if (!repuestos?.length) return []

  const rows = repuestos.map((r) => ({
    diagnostico_id: diagnosticoId,
    nombre: r.nombre,
    cantidad: r.cantidad || 1,
    es_base: !!r.es_base,
    urgencia: r.urgencia || 'recomendado',
    observacion: r.observacion || null,
  }))

  const { data, error } = await supabase
    .from('diagnostico_repuestos')
    .insert(rows)
    .select()

  if (error) throw error
  return data || []
}

export async function actualizarDiagnostico(diagnosticoId, datos) {
  const payload = { ...datos }
  if (datos.status === 'proceso' && !datos.fecha_inicio) payload.fecha_inicio = new Date().toISOString()
  if (['listo', 'cerrado'].includes(datos.status) && !datos.fecha_cierre) payload.fecha_cierre = new Date().toISOString()

  const { data, error } = await supabase
    .from('diagnosticos')
    .update(payload)
    .eq('id', diagnosticoId)
    .select()
    .single()

  if (error) throw error
  return data
}

function storageSafeSlug(value) {
  return String(value || 'general')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'general'
}

export async function subirFotoDiagnostico(diagnosticoId, seccion, itemOrArchivo, archivoMaybe) {
  const item = archivoMaybe ? itemOrArchivo : null
  const archivo = archivoMaybe || itemOrArchivo
  const ext = archivo.name?.split('.').pop() || 'jpg'
  const itemPath = storageSafeSlug(item)
  const path = `diagnosticos/${diagnosticoId}/s${seccion}/${itemPath}/${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('fotos-actas')
    .upload(path, archivo, { upsert: true })

  if (uploadError) throw uploadError

  const { data: urlData } = supabase.storage
    .from('fotos-actas')
    .getPublicUrl(path)

  let ultimaQuery = supabase
    .from('diagnostico_fotos')
    .select('orden')
    .eq('diagnostico_id', diagnosticoId)
    .eq('seccion', seccion)
    .order('orden', { ascending: false })
    .limit(1)
  ultimaQuery = item ? ultimaQuery.eq('item', item) : ultimaQuery.is('item', null)
  const { data: ultima } = await ultimaQuery
    .maybeSingle()

  const { data, error: dbError } = await supabase
    .from('diagnostico_fotos')
    .insert({
      diagnostico_id: diagnosticoId,
      seccion,
      item,
      url: urlData.publicUrl,
      orden: (ultima?.orden || 0) + 1,
    })
    .select()
    .single()

  if (dbError) throw dbError
  return data || { url: urlData.publicUrl, item, orden: (ultima?.orden || 0) + 1 }
}

export async function eliminarFotoDiagnostico(foto) {
  let query = supabase.from('diagnostico_fotos').delete()
  if (foto.id) query = query.eq('id', foto.id)
  else query = query.eq('diagnostico_id', foto.diagnostico_id).eq('seccion', foto.seccion).eq('url', foto.url)

  const { error } = await query
  if (error) throw error
}

export function clasificarMantencion(checklist) {
  const items = Array.isArray(checklist) ? checklist : Object.values(checklist || {})
  const normalizados = items.map((it) => ({
    item: (it.item || '').toLowerCase(),
    estado: it.estado,
  }))

  const enAtencion = (fragmentos) => normalizados.some((it) =>
    fragmentos.some((frag) => it.item.includes(frag)) &&
    ['requiere_atencion', 'urgente'].includes(it.estado)
  )

  const urgente = (fragmentos) => normalizados.some((it) =>
    fragmentos.some((frag) => it.item.includes(frag)) &&
    it.estado === 'urgente'
  )

  const esIntermedia = enAtencion(['bujía', 'bujias', 'pastilla', 'líquido de frenos', 'liquido de frenos'])
  const esFull = esIntermedia && (
    urgente(['neumático', 'neumatico', 'disco', 'amortiguador', 'bandeja', 'buje', 'rótula', 'rotula', 'cremallera', 'terminal', 'axial'])
  )

  if (esFull) return 'full'
  if (esIntermedia) return 'intermedia'
  return 'basica'
}

// --- Presupuestos / Cotizaciones ---
// Calcula precio cliente final (con IVA) desde costo bruto y margen real sobre precio de venta.
// margen real: utilidad / precio_venta_neto = margen%
// Fórmula: precio_neto = (costo_bruto / 1.19) / (1 - margen/100)
//          precio_final = precio_neto * 1.19
export function precioFinalConMargen(costoBruto, margenPct) {
  const pct = Number(margenPct)
  if (!(pct > 0 && pct < 100)) return Math.round(Number(costoBruto) || 0)
  const costoNeto = (Number(costoBruto) || 0) / 1.19
  return Math.round(costoNeto / (1 - pct / 100) * 1.19)
}

export function calcularTotalesCotizacion(items = [], descuento = 0, overrides = {}) {
  const rows = items.filter((it) => it.descripcion?.trim())
  const isMO = (it) => String(it.tipo || '').toLowerCase().includes('mano')
  const margenPct = Number(overrides.margen_pct) > 0 ? Number(overrides.margen_pct) : 30
  const horasTrabajo = Math.max(0, Number(overrides.horas_trabajo) || 0)
  const costoHoraTecnico = Math.max(0, Number(overrides.costo_hora_tecnico) || 0)

  // Precio neto al cliente (sin IVA) por fila:
  //   MO        → precio_unitario ingresado directamente ya es el neto
  //   Repuestos → si tiene precio_unitario guardado (final c/IVA), extraer neto (/1.19)
  //               si no, calcular desde costo bruto con margen real
  const precioClienteNeto = (it) => {
    if (isMO(it)) return Number(it.precio_unitario || 0)
    const pu = Number(it.precio_unitario || 0) // precio final guardado (con IVA)
    const cb = Number(it.costo_unitario  || 0) // costo bruto SECCO (con IVA)
    if (pu > 0) return Math.round(pu / 1.19)
    if (cb > 0) return Math.round((cb / 1.19) / (1 - margenPct / 100))
    return 0
  }

  // Costo neto SECCO (sin IVA) — solo repuestos/servicios, no MO
  const costoNetoSecco = (it) => {
    if (isMO(it)) return 0
    const cb = Number(it.costo_unitario || 0)
    return cb > 0 ? Math.round(cb / 1.19) : 0
  }

  // Bruto = suma de lo que aparece en la columna "Costo SECCO" × cantidad (lo que el usuario ve)
  const costoTotalBruto = rows.reduce((s, it) =>
    !isMO(it) ? s + Number(it.cantidad || 1) * (Number(it.costo_unitario) || 0) : s
  , 0)

  // Neto = bruto / 1.19 — costo real de repuestos
  const costoRepuestosNetos = rows.reduce((s, it) =>
    s + Number(it.cantidad || 1) * costoNetoSecco(it)
  , 0)

  // Venta neta antes de descuento
  const ventaRepuestosNetosBruta = rows
    .filter((it) => !isMO(it))
    .reduce((s, it) => s + Number(it.cantidad || 1) * precioClienteNeto(it), 0)

  const ventaMoBruta = rows
    .filter((it) => isMO(it))
    .reduce((s, it) => s + Number(it.cantidad || 1) * precioClienteNeto(it), 0)

  const netoAntesDescuento = ventaRepuestosNetosBruta + ventaMoBruta

  // El descuento comercial se aplica sobre el total final que paga el cliente.
  // No rebaja la base imponible, por lo tanto no afecta el IVA débito.
  const netoFinal = Math.max(0, netoAntesDescuento)
  const ventaRepuestosNetos = Math.round(ventaRepuestosNetosBruta)
  const ventaMo = Math.round(ventaMoBruta)

  const costoMoReal = Math.round(horasTrabajo * costoHoraTecnico)
  const costoTotalReal = Math.round(costoRepuestosNetos + costoMoReal)

  const utilidadRepuestos = Math.round(ventaRepuestosNetos - costoRepuestosNetos)
  const utilidadMo = Math.round(ventaMo - costoMoReal)
  const utilidadAntesDescuento = Math.round(utilidadRepuestos + utilidadMo)

  const ivaDebito = Math.round(netoFinal * 0.19)
  const ivaCredito = Math.round(costoRepuestosNetos * 0.19)
  const diferenciaIvaSii = ivaDebito - ivaCredito

  const subtotalCliente = Math.round(netoFinal + ivaDebito)
  const totalFinalSinDescuento = Math.round(subtotalCliente / 0.98)
  const cargoPorServicio = Math.round(totalFinalSinDescuento - subtotalCliente)
  const descuentoCalculado = overrides.descuento_tipo === 'porcentaje'
    ? totalFinalSinDescuento * (Number(descuento || 0) / 100)
    : Number(descuento || 0)
  const descuentoMonto = Math.min(totalFinalSinDescuento, Math.max(0, descuentoCalculado))
  const totalFinalCliente = Math.max(0, Math.round(totalFinalSinDescuento - descuentoMonto))
  const moConIva = Math.round(ventaMo * 1.19)
  const utilidadTotal = Math.round(utilidadAntesDescuento - descuentoMonto)
  const margen = netoFinal > 0 ? (utilidadTotal / netoFinal) * 100 : 0

  return {
    horas_trabajo:        horasTrabajo,
    costo_hora_tecnico:   Math.round(costoHoraTecnico),
    costo_total:          Math.round(costoTotalBruto), // legado: bruto repuestos
    costo_total_neto:     Math.round(costoRepuestosNetos), // legado
    costo_repuestos_netos: Math.round(costoRepuestosNetos),
    costo_mo_real:        costoMoReal,
    costo_total_real:     costoTotalReal,
    neto_repuestos:       Math.round(ventaRepuestosNetos), // legado
    venta_repuestos_netos: Math.round(ventaRepuestosNetos),
    neto_mo:              Math.round(ventaMo), // legado
    venta_mo:             Math.round(ventaMo),
    mo_con_iva:           moConIva,
    mano_obra_total:      Math.round(ventaMo), // legado
    neto_antes_descuento: Math.round(netoAntesDescuento),
    neto_final:           Math.round(netoFinal),
    descuento:            Math.round(descuentoMonto),
    descuento_valor:      Number(descuento || 0),
    descuento_tipo:       overrides.descuento_tipo || 'monto',
    subtotal:             Math.round(netoFinal), // legado
    iva:                  Math.round(ivaDebito), // legado
    iva_credito:          ivaCredito,
    iva_debito:           ivaDebito,
    dif_iva:              diferenciaIvaSii, // legado
    diferencia_iva_sii:   diferenciaIvaSii,
    subtotal_cliente:     subtotalCliente,
    cargo_por_servicio:   cargoPorServicio,
    total_final_sin_descuento: totalFinalSinDescuento,
    total_final_cliente:  totalFinalCliente,
    total:                subtotalCliente, // legado: subtotal cliente sin cargo
    utilidad_repuestos:   utilidadRepuestos,
    utilidad_mo:          utilidadMo,
    utilidad_antes_descuento: utilidadAntesDescuento,
    descuento_utilidad:   Math.round(descuentoMonto),
    utilidad:             utilidadTotal, // legado
    utilidad_total:       utilidadTotal,
    margen:               Number(margen.toFixed(2)), // legado
    margen_pct:           Number(margen.toFixed(2)),
  }
}

export function crearItemsBaseCotizacion(diagnostico) {
  const tipo = diagnostico.tipo_mantencion || 'basica'
  const base = [
    { tipo: 'servicio', descripcion: 'Mantención base: aceite, filtros y revisión general', cantidad: 1, costo_unitario: 0, precio_unitario: 0, mano_obra: 0, urgencia: 'necesario', observacion: tipo },
  ]

  const repuestos = (diagnostico.diagnostico_repuestos || []).map((r) => ({
    tipo: 'repuesto',
    descripcion: r.nombre || '',
    cantidad: r.cantidad || 1,
    costo_unitario: 0,
    precio_unitario: 0,
    mano_obra: 0,
    urgencia: r.urgencia || 'recomendado',
    observacion: r.observacion || '',
  }))

  const urgentes = (diagnostico.diagnostico_checklist || [])
    .filter((it) => ['requiere_atencion', 'urgente'].includes(it.estado) && it.item !== 'Comentario general de la sección')
    .slice(0, 8)
    .map((it) => ({
      tipo: 'trabajo',
      descripcion: it.item,
      cantidad: 1,
      costo_unitario: 0,
      precio_unitario: 0,
      mano_obra: 0,
      urgencia: it.estado === 'urgente' ? 'necesario' : 'recomendado',
      observacion: it.observacion || '',
    }))

  return [...base, ...repuestos, ...urgentes]
}

function mapTotalesCotizacionParaDB(totales) {
  return {
    costo_total: totales.costo_total,
    mano_obra_total: totales.mano_obra_total,
    neto_antes_descuento: totales.neto_antes_descuento,
    subtotal: totales.subtotal,
    descuento: totales.descuento,
    iva: totales.iva,
    total: totales.total,
    utilidad: totales.utilidad,
    margen: totales.margen,
  }
}

export async function listarDiagnosticosParaCotizar(limite = 30) {
  const { data, error } = await supabase
    .from('diagnosticos')
    .select(`
      *,
      actas (
        id,
        numero_acta,
        fecha_ingreso,
        km,
        trabajo_solicitado,
        clientes (id, nombre, telefono, email, rut),
        vehiculos (id, marca, modelo, anio, patente, vin, color)
      )
    `)
    .eq('status', 'listo')
    .order('fecha_cierre', { ascending: false })
    .limit(limite)

  if (error) throw error
  return data || []
}

export async function listarCotizaciones(limite = 30) {
  const { data, error } = await supabase
    .from('cotizaciones')
    .select(`
      *,
      diagnosticos (id, numero_diagnostico, tipo_mantencion, status),
      actas (id, numero_acta, fecha_ingreso),
      clientes (id, nombre, telefono, email, rut),
      vehiculos (id, marca, modelo, anio, patente, vin, color)
    `)
    .order('updated_at', { ascending: false })
    .limit(limite)

  if (error) throw error
  return data || []
}

export async function listarCotizacionesSinAsignar(limite = 30) {
  const { data, error } = await supabase
    .from('cotizaciones')
    .select(`
      *,
      clientes (id, nombre, telefono, email, rut),
      vehiculos (id, marca, modelo, anio, patente, vin, color)
    `)
    .in('status', ['sin_asignar', 'lista', 'enviada'])
    .is('acta_id', null)
    .is('vehiculo_id', null)
    .order('updated_at', { ascending: false })
    .limit(limite)

  if (error) throw error
  return data || []
}

export async function cargarCotizacionCompleta(cotizacionId) {
  const { data, error } = await supabase
    .from('cotizaciones')
    .select(`
      *,
      diagnosticos (
        *,
        diagnostico_checklist (*),
        diagnostico_repuestos (*),
        diagnostico_fotos (*)
      ),
      actas (*),
      clientes (*),
      vehiculos (*)
    `)
    .eq('id', cotizacionId)
    .single()

  if (error) throw error
  return data
}

export async function crearCotizacionDesdeDiagnostico(diagnosticoId) {
  const { data: existente } = await supabase
    .from('cotizaciones')
    .select('*')
    .eq('diagnostico_id', diagnosticoId)
    .in('status', ['borrador', 'lista', 'enviada'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existente) return cargarCotizacionCompleta(existente.id)

  const diagnostico = await cargarDiagnosticoCompleto(diagnosticoId)
  const acta = diagnostico.actas || {}
  const items = crearItemsBaseCotizacion(diagnostico)
  const totales = calcularTotalesCotizacion(items, 0)

  const { data, error } = await supabase
    .from('cotizaciones')
    .insert({
      diagnostico_id: diagnostico.id,
      acta_id: diagnostico.acta_id,
      vehiculo_id: acta.vehiculos?.id || acta.vehiculo_id || null,
      cliente_id: acta.clientes?.id || acta.cliente_id || null,
      items,
      status: 'borrador',
      notas: '',
      notas_internas: '',
      vista_cliente: {
        titulo: `Propuesta de mantención ${diagnostico.tipo_mantencion || ''}`.trim(),
        resumen: acta.trabajo_solicitado || '',
        tipo_presupuesto: 'final',
        descuento_tipo: 'monto',
        descuento_valor: 0,
        horas_trabajo: Number(diagnostico.horas_estimadas || 0),
        costo_hora_tecnico: 4900,
      },
      ...mapTotalesCotizacionParaDB(totales),
    })
    .select()
    .single()

  if (error) throw error
  return cargarCotizacionCompleta(data.id)
}

export async function crearCotizacionManual({ marca, modelo, patente, anio, nombre, telefono }) {
  const totales = calcularTotalesCotizacion([], 0)
  const titulo = [marca, modelo].filter(Boolean).join(' ').trim()

  const { data, error } = await supabase
    .from('cotizaciones')
    .insert({
      diagnostico_id: null,
      acta_id: null,
      vehiculo_id: null,
      cliente_id: null,
      items: [],
      status: 'sin_asignar',
      notas: '',
      notas_internas: '',
      vista_cliente: {
        titulo: titulo ? `Presupuesto ${titulo}` : 'Presupuesto sin asignar',
        resumen: '',
        tipo_presupuesto: 'inicial',
        descuento_tipo: 'monto',
        descuento_valor: 0,
        margen_pct: 30,
        horas_trabajo: 0,
        costo_hora_tecnico: 4900,
        cliente_manual: {
          nombre: nombre?.trim() || '',
          telefono: telefono?.trim() || '',
        },
        vehiculo_manual: {
          marca: marca?.trim() || '',
          modelo: modelo?.trim() || '',
          patente: patente?.trim()?.toUpperCase() || '',
          anio: anio || '',
        },
      },
      ...mapTotalesCotizacionParaDB(totales),
    })
    .select()
    .single()

  if (error) throw error
  return cargarCotizacionCompleta(data.id)
}

export async function asignarCotizacionAActa(cotizacionId, { actaId, vehiculoId, clienteId }) {
  if (!cotizacionId || !actaId || !vehiculoId) {
    throw new Error('Faltan datos para asignar el presupuesto al acta.')
  }

  const { data, error } = await supabase
    .from('cotizaciones')
    .update({
      acta_id: actaId,
      vehiculo_id: vehiculoId,
      cliente_id: clienteId || null,
      status: 'asignado',
      updated_at: new Date().toISOString(),
    })
    .eq('id', cotizacionId)
    .in('status', ['sin_asignar', 'lista', 'enviada'])
    .is('acta_id', null)
    .is('vehiculo_id', null)
    .select()
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('El presupuesto ya fue asignado o no está disponible.')
  return cargarCotizacionCompleta(data.id)
}

export async function guardarCotizacion(cotizacionId, datos) {
  const items = (datos.items || []).map((it) => {
    const esManoDeObra = String(it.tipo || '').toLowerCase().includes('mano')
    const costo = Number(it.costo_unitario || 0)
    const precio = Number(it.precio_unitario || 0)
    const manoObra = Number(it.precio_unitario || it.mano_obra || 0)

    return {
      ...it,
      costo_unitario: esManoDeObra ? 0 : costo,
      precio_unitario: esManoDeObra
        ? Math.round(manoObra)
        : (precio > 0 ? Math.round(precio) : Math.round(costo * 1.3)),
      mano_obra: esManoDeObra ? Math.round(manoObra) : 0,
    }
  })
  const totales = calcularTotalesCotizacion(items, datos.descuento, {
    ...(datos.totales_manual || {}),
    descuento_tipo: datos.descuento_tipo || 'monto',
    horas_trabajo: datos.vista_cliente?.horas_trabajo,
    costo_hora_tecnico: datos.vista_cliente?.costo_hora_tecnico,
  })
  const payload = {
    items,
    notas: datos.notas || '',
    notas_internas: datos.notas_internas || '',
    vista_cliente: datos.vista_cliente || {},
    updated_at: new Date().toISOString(),
    ...mapTotalesCotizacionParaDB(totales),
  }
  if (datos.status) payload.status = datos.status

  const { data, error } = await supabase
    .from('cotizaciones')
    .update(payload)
    .eq('id', cotizacionId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function actualizarEstadoCotizacion(cotizacionId, status) {
  const { data, error } = await supabase
    .from('cotizaciones')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', cotizacionId)
    .select()
    .single()

  if (error) throw error
  return data
}

// ─── Flujo post-presupuesto ───────────────────────────────────

export async function listarTecnicos() {
  const { data, error } = await supabase
    .from('tecnicos')
    .select('*')
    .eq('activo', true)
    .order('nombre')
  if (error) throw error
  return data || []
}

function otItemId(prefix, index, text = '') {
  const slug = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 22)
  return `${prefix}-${index + 1}${slug ? `-${slug}` : ''}`
}

export function estructurarOTDesdeItems(items = []) {
  const rows = (items || []).filter((it) => String(it.descripcion || '').trim())
  const esManoObra = (it) => String(it.tipo || '').toLowerCase().includes('mano')
  const esRepuesto = (it) => String(it.tipo || '').toLowerCase().includes('repuesto')

  const repuestos = rows
    .filter((it) => esRepuesto(it))
    .map((it, index) => ({
      id: it.id || otItemId('rep', index, it.descripcion),
      nombre: it.descripcion || '',
      cantidad: Number(it.cantidad || 1),
      precio: Number(it.precio_unitario || 0),
      origen: 'presupuesto',
    }))

  const instrucciones = rows
    .filter((it) => !esRepuesto(it) && !esManoObra(it))
    .map((it, index) => ({
      id: it.id || otItemId('ins', index, it.descripcion),
      texto: it.descripcion || '',
      repuestos_ids: [],
      orden: index + 1,
      completada: false,
    }))

  if (!instrucciones.length && repuestos.length) {
    instrucciones.push({
      id: 'ins-1-revision-general',
      texto: 'Ejecutar trabajos aprobados según presupuesto y diagnóstico.',
      repuestos_ids: repuestos.map((r) => r.id),
      orden: 1,
      completada: false,
    })
  }

  return { repuestos, instrucciones }
}

export async function aprobarCotizacion(cotizacionId) {
  const cot = await cargarCotizacionCompleta(cotizacionId)
  const estructuraOT = estructurarOTDesdeItems(cot.items || [])

  const { error: errCot } = await supabase
    .from('cotizaciones')
    .update({ status: 'aprobada', updated_at: new Date().toISOString() })
    .eq('id', cotizacionId)
  if (errCot) throw errCot

  const { data: ot, error: errOT } = await supabase
    .from('ordenes_trabajo')
    .insert({
      cotizacion_id: cotizacionId,
      acta_id: cot.acta_id || cot.diagnosticos?.acta_id || null,
      vehiculo_id: cot.vehiculo_id || null,
      cliente_id: cot.cliente_id || null,
      status: 'generada',
      items: cot.items || [],
      repuestos: estructuraOT.repuestos,
      instrucciones: estructuraOT.instrucciones,
      mano_obra: cot.neto_mo || 0,
      observaciones: cot.notas || '',
      notas_torre: '',
      historial: [{ ts: new Date().toISOString(), accion: 'OT generada desde cotización', nota: `COT-${cot.numero_cotizacion}` }],
    })
    .select()
    .single()
  if (errOT) throw errOT

  return cargarOTCompleta(ot.id)
}

export async function rechazarCotizacion(cotizacionId, motivo = '') {
  const { error } = await supabase
    .from('cotizaciones')
    .update({ status: 'rechazada', motivo_rechazo: motivo, updated_at: new Date().toISOString() })
    .eq('id', cotizacionId)
  if (error) throw error
}

export async function cargarOTCompleta(otId) {
  const { data, error } = await supabase
    .from('ordenes_trabajo')
    .select(`
      *,
      cotizaciones!cotizacion_id ( *, diagnosticos ( *, diagnostico_checklist(*), diagnostico_repuestos(*), actas ( *, vehiculos(*), clientes(*) ) ) ),
      vehiculos!vehiculo_id (*),
      clientes!cliente_id (*),
      actas!acta_id ( *, vehiculos(*), clientes(*) )
    `)
    .eq('id', otId)
    .single()
  if (error) throw error
  return data
}

export async function listarOTs(limite = 30) {
  const { data, error } = await supabase
    .from('ordenes_trabajo')
    .select(`
      id, numero_ot, status, tecnico_nombre, created_at, updated_at,
      vehiculos:vehiculo_id ( marca, modelo, patente ),
      clientes:cliente_id ( nombre ),
      actas:acta_id ( km, vehiculos ( marca, modelo, patente ), clientes ( nombre ) )
    `)
    .order('created_at', { ascending: false })
    .limit(limite)
  if (error) throw error
  return data || []
}

export async function listarOTsPorTecnico(nombre) {
  let q = supabase
    .from('ordenes_trabajo')
    .select(`
      id, numero_ot, status, tecnico_nombre, created_at, updated_at,
      vehiculos:vehiculo_id ( marca, modelo, patente ),
      clientes:cliente_id ( nombre ),
      actas:acta_id ( vehiculos ( marca, modelo, patente ), clientes ( nombre ) )
    `)
    .in('status', ['asignada', 'en_proceso', 'finalizada'])
    .order('created_at', { ascending: false })
  if (nombre) q = q.eq('tecnico_nombre', nombre)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function asignarTecnico(otId, tecnicoNombre) {
  const entrada = { ts: new Date().toISOString(), accion: 'Técnico asignado', nota: tecnicoNombre }
  const { data: prev } = await supabase.from('ordenes_trabajo').select('historial').eq('id', otId).single()
  const historial = [...(prev?.historial || []), entrada]
  const { error } = await supabase
    .from('ordenes_trabajo')
    .update({ tecnico_nombre: tecnicoNombre, status: 'asignada', historial, updated_at: new Date().toISOString() })
    .eq('id', otId)
  if (error) throw error
}

export async function avanzarEstadoOT(otId, nuevoStatus, nota = '') {
  const entrada = { ts: new Date().toISOString(), accion: `Estado: ${nuevoStatus}`, nota }
  const { data: prev } = await supabase.from('ordenes_trabajo').select('historial').eq('id', otId).single()
  const historial = [...(prev?.historial || []), entrada]
  const { error } = await supabase
    .from('ordenes_trabajo')
    .update({ status: nuevoStatus, historial, updated_at: new Date().toISOString() })
    .eq('id', otId)
  if (error) throw error
}

export async function editarOT(otId, cambios) {
  const { error } = await supabase
    .from('ordenes_trabajo')
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq('id', otId)
  if (error) throw error
}
