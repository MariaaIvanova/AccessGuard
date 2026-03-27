import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { messages, system } = await req.json()
    const apiKey = Deno.env.get('OPENAI_API_KEY')

    if (!apiKey) {
      return new Response(
        JSON.stringify({ reply: 'Липсва OPENAI_API_KEY в Supabase secrets.' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'system',
            content:
              system ||
              'Ти си AI асистент в AccessGuard. Отговаряй кратко и на български.',
          },
          ...(messages || []),
        ],
        temperature: 0.4,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      const errMsg =
        data?.error?.message ||
        data?.message ||
        `OpenAI error (${response.status})`

      return new Response(
        JSON.stringify({ reply: `Грешка от AI услугата: ${errMsg}` }),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const reply = data?.choices?.[0]?.message?.content

    return new Response(
      JSON.stringify({
        reply: reply || 'AI не върна текстов отговор.',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({
        reply: `Server error: ${err?.message || 'Unknown error'}`,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})