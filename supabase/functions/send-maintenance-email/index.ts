const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type EmailPayload = {
  to?: string
  subject?: string
  html?: string
  text?: string
  eventType?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Metodo no permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('EMAIL_FROM') || 'SECCO <no-reply@secco.cl>'
  const configuredReplyTo = Deno.env.get('EMAIL_REPLY_TO')?.trim()
  const replyTo = configuredReplyTo && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(configuredReplyTo)
    ? configuredReplyTo
    : undefined

  if (!resendApiKey) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY no configurada' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const payload = await req.json() as EmailPayload
  if (!payload.to || !payload.subject || !payload.html) {
    return new Response(JSON.stringify({ error: 'Faltan campos requeridos' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      reply_to: replyTo,
      tags: payload.eventType ? [{ name: 'event_type', value: payload.eventType }] : undefined,
    }),
  })

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    console.error('Resend email failed', {
      status: response.status,
      eventType: payload.eventType,
      toDomain: payload.to.split('@')[1] || null,
      error: result?.message || result?.error || 'No se pudo enviar el correo',
    })

    return new Response(JSON.stringify({ error: result?.message || 'No se pudo enviar el correo', details: result }), {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
