import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { booking_id } = await req.json()
    if (!booking_id) throw new Error("Missing booking_id")

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch booking details
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select(`
        id, customer_name, customer_phone, booking_date, status, payment_screenshot, start_time, end_time,
        pitches (
          name, owner_id,
          owners ( telegram_chat_id )
        )
      `)
      .eq('id', booking_id)
      .single()

    if (bookingErr || !booking) {
      throw new Error("Booking not found")
    }

    const ownerChatId = booking.pitches?.owners?.telegram_chat_id
    if (!ownerChatId) {
      console.log("Owner has no telegram_chat_id set. Skipping notification.")
      return new Response(JSON.stringify({ message: "Skipped" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Generate public URL for the screenshot
    const { data: publicUrlData } = supabase.storage
      .from('booking_receipts')
      .getPublicUrl(booking.payment_screenshot)
      
    const imageUrl = publicUrlData.publicUrl

    const shortId = booking.id.split('-')[0]
    
    // Format Time
    const formatTime = (timeStr: string) => {
        const [h, m] = timeStr.split(':')
        const d = new Date()
        d.setHours(Number(h), Number(m))
        return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    }

    // Message text
    const message = `
🎉 <b>حجز جديد مؤكد!</b>

<b>الملعب:</b> ${booking.pitches?.name}
<b>اسم العميل:</b> ${booking.customer_name}
<b>تليفون العميل:</b> ${booking.customer_phone}
<b>تاريخ الحجز:</b> ${booking.booking_date}
<b>الوقت:</b> ${formatTime(booking.start_time)} - ${formatTime(booking.end_time)}

<b>رقم الحجز:</b> #${shortId}
    `.trim()

    // Send Photo to Telegram
    const telegramApi = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`
    
    const response = await fetch(telegramApi, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ownerChatId,
        photo: imageUrl,
        caption: message,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "❌ إلغاء الحجز (إيصال مزور/خاطئ)",
                callback_data: `cancel_${booking.id}`
              }
            ]
          ]
        }
      })
    })

    const tgResult = await response.json()

    return new Response(JSON.stringify({ success: true, tgResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})