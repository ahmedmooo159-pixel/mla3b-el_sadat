import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')

serve(async (req) => {
  try {
    const { booking_id, refund_amount, wallet_number } = await req.json()
    if (!booking_id) throw new Error("Missing booking_id")

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    const { data: booking, error } = await supabase
      .from('bookings')
      .select(`
        id, customer_name, customer_phone, booking_date,
        slots (
          start_time, end_time,
          pitches (
            name,
            owners ( telegram_chat_id )
          )
        )
      `)
      .eq('id', booking_id)
      .single()

    if (error || !booking) throw new Error("Booking not found")

    const ownerChatId = booking.slots?.pitches?.owners?.telegram_chat_id
    if (!ownerChatId) {
      return new Response(JSON.stringify({ message: "No chat ID set" }), { headers: { "Content-Type": "application/json" } })
    }

    const shortId = booking.id.split('-')[0]
    const refundText = refund_amount > 0
      ? `\n💰 <b>مبلغ الاسترداد:</b> ${refund_amount} جنيه\n📱 <b>رقم المحفظة:</b> ${wallet_number}`
      : `\n⚠️ لا يوجد استرداد حسب سياسة الإلغاء.`

    const message = `
❌ <b>طلب إلغاء حجز!</b>

<b>الملعب:</b> ${booking.slots.pitches.name}
<b>اسم العميل:</b> ${booking.customer_name || 'غير محدد'}
<b>تليفون العميل:</b> ${booking.customer_phone || 'غير محدد'}
<b>تاريخ الحجز:</b> ${booking.booking_date}
<b>رقم الحجز:</b> #${shortId}
${refundText}

يرجى التواصل مع العميل وإرجاع المبلغ المستحق.
    `.trim()

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ownerChatId,
        text: message,
        parse_mode: 'HTML'
      })
    })

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400 })
  }
})
