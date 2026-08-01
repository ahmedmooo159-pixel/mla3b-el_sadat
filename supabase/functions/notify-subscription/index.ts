import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { record, receiptUrl, ownerName, pitchName } = await req.json()
    
    const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const CHAT_ID = Deno.env.get('TELEGRAM_ADMIN_CHAT_ID')

    if (!BOT_TOKEN || !CHAT_ID) {
      throw new Error('Telegram credentials not configured in edge function secrets.')
    }

    const message = `🔔 *طلب تفعيل اشتراك جديد*\n\n` +
      `👤 *المالك:* ${ownerName}\n` +
      `⚽ *الملعب:* ${pitchName}\n` +
      `🔗 *إثبات الدفع:* [اضغط هنا لمشاهدة الإيصال](${receiptUrl})\n\n` +
      `يرجى المراجعة وتفعيل الاشتراك من لوحة تحكم Supabase.`;

    const telegramApiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`
    
    const response = await fetch(telegramApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
      }),
    })

    const result = await response.json()

    if (!result.ok) {
      throw new Error(`Telegram API Error: ${result.description}`)
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Notification sent' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    )
  }
})
