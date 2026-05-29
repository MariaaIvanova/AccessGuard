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
        JSON.stringify({ reply: 'Невалидна заявка.' }),
        { status: 200, headers: corsHeaders }
      )
    }

    const { messages, system } = body

    const apiKey = Deno.env.get('OPENROUTER_API_KEY')

    if (!apiKey) {
      return new Response(
        JSON.stringify({ reply: 'Липсва OPENROUTER_API_KEY в Supabase secrets.' }),
        { status: 200, headers: corsHeaders }
      )
    }

    const safeMessages = Array.isArray(messages) ? messages : []

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://mariaaivanova.github.io/AccessGuard/',
        'X-Title': 'AccessGuard',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              system ||
              'Ти си AI асистент в AccessGuard. Отговаряй кратко, ясно и само на български.',
          },
          ...safeMessages,
        ],
        temperature: 0.4,
        max_tokens: 350,
      }),
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      const errorMessage =
        data?.error?.message ||
        data?.message ||
        `Грешка от AI услугата (${response.status}).`

      return new Response(
        JSON.stringify({ reply: `AI грешка: ${errorMessage}` }),
        { status: 200, headers: corsHeaders }
      )
    }

    const reply =
      data?.choices?.[0]?.message?.content?.trim() ||
      'AI не върна текстов отговор.'

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