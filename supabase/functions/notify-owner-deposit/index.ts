import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
const daysMap = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

serve(async (req) => {
  try {
    const { recurring_id } = await req.json()
    if (!recurring_id) throw new Error("Missing recurring_id")

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    const { data: rb, error } = await supabase
      .from('recurring_bookings')
      .select(`
        id, customer_name, customer_phone, deposit_amount,
        slots (
          day_of_week, start_time, end_time,
          pitches (
            name,
            owners ( telegram_chat_id )
          )
        )
      `)
      .eq('id', recurring_id)
      .single()

    if (error || !rb) throw new Error("Recurring booking not found")

    const ownerChatId = rb.slots?.pitches?.owners?.telegram_chat_id
    if (!ownerChatId) {
      return new Response(JSON.stringify({ message: "No chat ID" }), { headers: { "Content-Type": "application/json" } })
    }

    const dayName = daysMap[rb.slots.day_of_week]
    const formatTime = (t) => {
      const [h, m] = t.split(':')
      const d = new Date()
      d.setHours(h, m)
      return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    }

    const message = `
🔁 <b>حجز أسبوعي ثابت جديد!</b>

<b>الملعب:</b> ${rb.slots.pitches.name}
<b>الموعد الثابت:</b> كل ${dayName} ${formatTime(rb.slots.start_time)} - ${formatTime(rb.slots.end_time)}
<b>اسم العميل:</b> ${rb.customer_name}
<b>تليفون العميل:</b> ${rb.customer_phone}
<b>مبلغ العربون:</b> ${rb.deposit_amount} جنيه ✅

تم استلام العربون وتثبيت الموعد الأسبوعي. الموعد لن يظهر لأي عميل آخر من الآن.
    `.trim()

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ownerChatId, text: message, parse_mode: 'HTML' })
    })

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400 })
  }
})
