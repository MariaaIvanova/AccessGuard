import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => null)

    if (!body) {
      return new Response(
        JSON.stringify({ reply: 'Невалидно request body.' }),
        { status: 200, headers: corsHeaders }
      )
    }

    const { messages, system } = body
    const apiKey = Deno.env.get('OPENAI_API_KEY')

    if (!apiKey) {
      return new Response(
        JSON.stringify({ reply: 'Липсва OPENAI_API_KEY в Supabase secrets.' }),
        { status: 200, headers: corsHeaders }
      )
    }

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'system',
            content:
              system || 'Ти си AI асистент в AccessGuard. Отговаряй кратко и на български.',
          },
          ...(Array.isArray(messages) ? messages : []),
        ],
        temperature: 0.4,
      }),
    })

    const data = await openaiRes.json().catch(() => null)

    if (!openaiRes.ok) {
      const msg =
        data?.error?.message ||
        `OpenAI error ${openaiRes.status}`

      return new Response(
        JSON.stringify({ reply: `AI грешка: ${msg}` }),
        { status: 200, headers: corsHeaders }
      )
    }

    const reply =
      data?.choices?.[0]?.message?.content?.trim() ||
      'AI не върна текст.'

    return new Response(
      JSON.stringify({ reply }),
      { status: 200, headers: corsHeaders }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({
        reply: `Server error: ${err?.message || 'Unknown error'}`,
      }),
      { status: 200, headers: corsHeaders }
    )
  }
})