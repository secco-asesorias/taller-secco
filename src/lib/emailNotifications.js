import { supabase, supabaseConfigurado } from './supabase'

export const EMAIL_EVENTS = {
  INGRESO_VEHICULO: 'ingreso_vehiculo',
  INICIO_MANTENCION: 'inicio_mantencion',
  MANTENCION_FINALIZADA: 'mantencion_finalizada',
}

const EVENT_META = {
  [EMAIL_EVENTS.INGRESO_VEHICULO]: {
    scopeType: 'acta',
    title: 'Vehiculo ingresado a SECCO',
    accent: '#a98225',
  },
  [EMAIL_EVENTS.INICIO_MANTENCION]: {
    scopeType: 'orden_trabajo',
    title: 'Mantencion iniciada',
    accent: '#5064c8',
  },
  [EMAIL_EVENTS.MANTENCION_FINALIZADA]: {
    scopeType: 'orden_trabajo',
    title: 'Mantencion finalizada',
    accent: '#228b50',
  },
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '') || ''
}

function formatDate(value) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split('-')
    return `${day}-${month}-${year}`
  }
  const date = new Date(value)
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString('es-CL', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }
  return String(value)
}

function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('es-CL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function vehicleLabel(data) {
  return [data.marca, data.modelo].filter(Boolean).join(' ').trim()
}

function row(label, value) {
  if (!value) return ''
  return `
    <tr>
      <td style="padding:8px 0;color:#6B6B6B;font-size:13px;line-height:1.4;">${escapeHtml(label)}</td>
      <td style="padding:8px 0;color:#111114;font-size:13px;line-height:1.4;font-weight:600;text-align:right;">${escapeHtml(value)}</td>
    </tr>
  `
}

function layout({ title, intro, rows, footer, accent }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#F5F5F5;font-family:Arial,Helvetica,sans-serif;color:#111114;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F5F5F5;margin:0;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E0E0E0;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:22px 24px 16px;border-top:4px solid ${accent};">
                <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${accent};font-weight:700;margin-bottom:8px;">SECCO</div>
                <h1 style="margin:0;color:#111114;font-size:22px;line-height:1.25;font-weight:700;">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 18px;">
                <p style="margin:0;color:#333333;font-size:15px;line-height:1.6;">${intro}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 20px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #EAEAEA;border-bottom:1px solid #EAEAEA;">
                  ${rows}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px;">
                <p style="margin:0;color:#333333;font-size:14px;line-height:1.6;">${footer}</p>
              </td>
            </tr>
          </table>
          <p style="max-width:560px;margin:14px 0 0;color:#8A8A8A;font-size:12px;line-height:1.5;">Este correo fue generado automaticamente por el sistema de mantenciones SECCO.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function buildTemplate(eventType, data) {
  const cliente = data.nombre_cliente || 'cliente'
  const vehiculo = vehicleLabel(data)
  const meta = EVENT_META[eventType]

  if (eventType === EMAIL_EVENTS.INGRESO_VEHICULO) {
    const title = 'Tu vehiculo fue ingresado correctamente'
    const subject = `${data.patente ? `${data.patente} - ` : ''}Vehiculo ingresado en SECCO`
    const intro = `Hola ${escapeHtml(cliente)}, te confirmamos que tu vehiculo ya fue ingresado correctamente al sistema de SECCO. El proceso de revision o mantencion comenzara segun lo coordinado.`
    const footer = 'Nuestro equipo mantendra informado el avance del proceso y te contactara si requiere validar algun antecedente adicional.'
    const rows = [
      row('Cliente', data.nombre_cliente),
      row('Patente', data.patente),
      row('Modelo', vehiculo),
      row('Fecha de ingreso', data.fecha_ingreso),
      row('Responsable', data.responsable),
    ].join('')
    return { subject, html: layout({ title, intro, rows, footer, accent: meta.accent }), text: `${title}\n\n${intro.replace(/<[^>]+>/g, '')}\n\n${footer}` }
  }

  if (eventType === EMAIL_EVENTS.INICIO_MANTENCION) {
    const title = 'Ya comenzamos la mantencion de tu vehiculo'
    const subject = `${data.patente ? `${data.patente} - ` : ''}Mantencion iniciada`
    const intro = `Hola ${escapeHtml(cliente)}, nuestro equipo tecnico ya esta trabajando en tu vehiculo.`
    const footer = 'Si durante el proceso encontramos algun hallazgo importante, te notificaremos para mantenerte al tanto y coordinar los pasos necesarios.'
    const rows = [
      row('Cliente', data.nombre_cliente),
      row('Patente', data.patente),
      row('Modelo', vehiculo),
      row('Tecnico asignado', data.tecnico_asignado),
      row('Inicio', data.fecha_inicio),
    ].join('')
    return { subject, html: layout({ title, intro, rows, footer, accent: meta.accent }), text: `${title}\n\n${intro.replace(/<[^>]+>/g, '')}\n\n${footer}` }
  }

  const title = 'Tu vehiculo esta listo para entrega'
  const subject = `${data.patente ? `${data.patente} - ` : ''}Mantencion finalizada`
  const intro = `Hola ${escapeHtml(cliente)}, te informamos que la mantencion de tu vehiculo fue finalizada y ya se encuentra listo para entrega o retiro.`
  const footer = 'El equipo de SECCO queda disponible ante cualquier duda. Para la entrega, coordinaremos contigo el retiro y cualquier antecedente pendiente.'
  const rows = [
    row('Cliente', data.nombre_cliente),
    row('Patente', data.patente),
    row('Modelo', vehiculo),
    row('Finalizacion', data.fecha_fin),
    row('Trabajo realizado', data.resumen_trabajo),
    row('Proximos pasos', data.proximos_pasos),
  ].join('')
  return { subject, html: layout({ title, intro, rows, footer, accent: meta.accent }), text: `${title}\n\n${intro.replace(/<[^>]+>/g, '')}\n\n${footer}` }
}

function actaData(acta) {
  const veh = acta.vehiculos || {}
  const cli = acta.clientes || {}
  return {
    acta_id: acta.id,
    cliente_id: cli.id || acta.cliente_id || null,
    to: cli.email || '',
    nombre_cliente: cli.nombre || '',
    patente: veh.patente || '',
    marca: veh.marca || '',
    modelo: veh.modelo || '',
    fecha_ingreso: formatDate(acta.fecha_ingreso),
    responsable: firstValue(acta.tc_nombre, acta.tecnico_nombre),
  }
}

function otData(ot) {
  const acta = ot.actas || ot.cotizaciones?.diagnosticos?.actas || {}
  const veh = ot.vehiculos || acta.vehiculos || {}
  const cli = ot.clientes || acta.clientes || {}
  const historial = Array.isArray(ot.historial) ? ot.historial : []
  const inicio = [...historial].reverse().find((entry) => entry.accion === 'Estado: en_proceso')?.ts
  const fin = [...historial].reverse().find((entry) => entry.accion === 'Estado: finalizada')?.ts
  const instrucciones = Array.isArray(ot.instrucciones) ? ot.instrucciones : []
  const resumen = [
    ot.observaciones,
    instrucciones.filter((item) => item.texto).slice(0, 3).map((item) => item.texto).join('; '),
  ].filter(Boolean).join(' - ')

  return {
    acta_id: acta.id || ot.acta_id || null,
    cliente_id: cli.id || ot.cliente_id || null,
    to: cli.email || '',
    nombre_cliente: cli.nombre || '',
    patente: veh.patente || '',
    marca: veh.marca || '',
    modelo: veh.modelo || '',
    tecnico_asignado: firstValue(ot.tecnico_nombre, ot.tecnico_asignado),
    fecha_inicio: formatDateTime(inicio || ot.updated_at || new Date().toISOString()),
    fecha_fin: formatDateTime(fin || ot.updated_at || new Date().toISOString()),
    resumen_trabajo: resumen || 'Mantencion realizada segun los trabajos coordinados.',
    proximos_pasos: 'Coordinaremos contigo la entrega o retiro del vehiculo.',
  }
}

async function crearRegistro({ eventType, scopeType, scopeId, data, template, status = 'pending', errorMessage = null }) {
  const { data: rowData, error } = await supabase
    .from('email_notificaciones')
    .insert({
      event_type: eventType,
      scope_type: scopeType,
      scope_id: scopeId,
      acta_id: data.acta_id || null,
      cliente_id: data.cliente_id || null,
      email_destino: data.to || null,
      subject: template.subject,
      html: template.html,
      text: template.text,
      template_data: data,
      status,
      error_message: errorMessage,
    })
    .select()
    .single()

  if (error?.code === '23505') {
    const { data: existente, error: findError } = await supabase
      .from('email_notificaciones')
      .select('*')
      .eq('event_type', eventType)
      .eq('scope_type', scopeType)
      .eq('scope_id', scopeId)
      .is('manual_resend_of', null)
      .single()

    if (findError) throw findError
    if (existente?.status === 'sent' || existente?.status === 'pending') {
      return { skipped: true, row: existente }
    }

    const { data: actualizado, error: updateError } = await supabase
      .from('email_notificaciones')
      .update({
        acta_id: data.acta_id || null,
        cliente_id: data.cliente_id || null,
        email_destino: data.to || null,
        subject: template.subject,
        html: template.html,
        text: template.text,
        template_data: data,
        status,
        provider_message_id: null,
        sent_at: null,
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existente.id)
      .select()
      .single()

    if (updateError) throw updateError
    return { row: actualizado, retry: true }
  }
  if (error) throw error
  return { row: rowData }
}

async function actualizarRegistro(id, cambios) {
  if (!id) return
  const { error } = await supabase
    .from('email_notificaciones')
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

async function mensajeErrorEnvio(error, fallback = 'No se pudo enviar el correo') {
  const mensajes = []
  if (error?.context?.clone) {
    try {
      const body = await error.context.clone().json()
      mensajes.push(body?.error, body?.details?.message, body?.message)
    } catch {
      // La respuesta de Edge Function no siempre trae JSON parseable.
    }
  }

  mensajes.push(error?.message, fallback)
  return mensajes.find((mensaje) => typeof mensaje === 'string' && mensaje.trim()) || fallback
}

export async function enviarNotificacionProceso(eventType, scopeId, data) {
  if (!supabaseConfigurado() || !scopeId) return { skipped: true }

  const meta = EVENT_META[eventType]
  const template = buildTemplate(eventType, data)
  const status = data.to ? 'pending' : 'skipped'
  const errorMessage = data.to ? null : 'Cliente sin email registrado'
  const registro = await crearRegistro({
    eventType,
    scopeType: meta.scopeType,
    scopeId,
    data,
    template,
    status,
    errorMessage,
  })

  if (registro.skipped || !data.to) return registro

  try {
    const { data: result, error } = await supabase.functions.invoke('send-maintenance-email', {
      body: {
        to: data.to,
        subject: template.subject,
        html: template.html,
        text: template.text,
        eventType,
      },
    })
    if (error) throw error
    await actualizarRegistro(registro.row.id, {
      status: 'sent',
      sent_at: new Date().toISOString(),
      provider_message_id: result?.id || null,
      error_message: null,
    })
    return { sent: true }
  } catch (error) {
    const errorMessage = await mensajeErrorEnvio(error)
    await actualizarRegistro(registro.row.id, {
      status: 'failed',
      error_message: errorMessage,
    })
    throw new Error(errorMessage)
  }
}

export async function reenviarNotificacionManual(registroId) {
  if (!supabaseConfigurado() || !registroId) return { skipped: true }

  const { data: original, error } = await supabase
    .from('email_notificaciones')
    .select('*')
    .eq('id', registroId)
    .single()
  if (error) throw error
  if (!original?.email_destino) throw new Error('La notificacion original no tiene email destino.')

  const { data: manual, error: insertError } = await supabase
    .from('email_notificaciones')
    .insert({
      event_type: original.event_type,
      scope_type: original.scope_type,
      scope_id: original.scope_id,
      acta_id: original.acta_id,
      cliente_id: original.cliente_id,
      email_destino: original.email_destino,
      subject: original.subject,
      html: original.html,
      text: original.text,
      template_data: original.template_data || {},
      status: 'pending',
      manual_resend_of: original.id,
    })
    .select()
    .single()
  if (insertError) throw insertError

  try {
    const { data: result, error: invokeError } = await supabase.functions.invoke('send-maintenance-email', {
      body: {
        to: original.email_destino,
        subject: original.subject,
        html: original.html,
        text: original.text,
        eventType: original.event_type,
      },
    })
    if (invokeError) throw invokeError
    await actualizarRegistro(manual.id, {
      status: 'sent',
      sent_at: new Date().toISOString(),
      provider_message_id: result?.id || null,
      error_message: null,
    })
    return { sent: true }
  } catch (sendError) {
    const errorMessage = await mensajeErrorEnvio(sendError, 'No se pudo reenviar el correo')
    await actualizarRegistro(manual.id, {
      status: 'failed',
      error_message: errorMessage,
    })
    throw new Error(errorMessage)
  }
}

export async function notificarIngresoActa(acta) {
  try {
    return await enviarNotificacionProceso(EMAIL_EVENTS.INGRESO_VEHICULO, acta.id, actaData(acta))
  } catch (error) {
    console.warn('Correo de ingreso no enviado:', error.message)
    return { error }
  }
}

export async function notificarInicioMantencion(ot) {
  try {
    return await enviarNotificacionProceso(EMAIL_EVENTS.INICIO_MANTENCION, ot.id, otData(ot))
  } catch (error) {
    console.warn('Correo de inicio de mantencion no enviado:', error.message)
    return { error }
  }
}

export async function notificarMantencionFinalizada(ot) {
  try {
    return await enviarNotificacionProceso(EMAIL_EVENTS.MANTENCION_FINALIZADA, ot.id, otData(ot))
  } catch (error) {
    console.warn('Correo de mantencion finalizada no enviado:', error.message)
    return { error }
  }
}
