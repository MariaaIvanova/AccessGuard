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
    const { messages, system } = await req.json()

    const apiKey = Deno.env.get('OPENROUTER_API_KEY')

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: system || 'Отговаряй на български.',
          },
          ...(messages || []),
        ],
      }),
    })

    const data = await response.json()

    const reply = data?.choices?.[0]?.message?.content || 'Няма отговор.'

    return new Response(JSON.stringify({ reply }), {
      headers: corsHeaders,
    })
  } catch (err) {
    return new Response(JSON.stringify({ reply: 'Server error' }), {
      headers: corsHeaders,
    })
  }
})