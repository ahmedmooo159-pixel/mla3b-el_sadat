import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')

serve(async (req) => {
  try {
    const update = await req.json()

    // We only care about callback_query
    if (update.callback_query) {
      const callbackQuery = update.callback_query
      const data = callbackQuery.data
      const messageId = callbackQuery.message.message_id
      const chatId = callbackQuery.message.chat.id

      if (data.startsWith('cancel_')) {
        const bookingId = data.replace('cancel_', '')

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Update booking status to cancelled
        const { error } = await supabase
          .from('bookings')
          .update({ status: 'cancelled' })
          .eq('id', bookingId)

        let answerText = "تم إلغاء الحجز بنجاح والموعد متاح الآن."
        
        if (error) {
          answerText = "حدث خطأ أثناء الإلغاء، يرجى مراجعة لوحة التحكم."
        } else {
            // Edit the message caption to reflect cancellation
            const originalCaption = callbackQuery.message.caption || ""
            const newCaption = `❌ <b>تم إلغاء هذا الحجز بواسطة المالك.</b>\n\n` + originalCaption
            
            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageCaption`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    message_id: messageId,
                    caption: newCaption,
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: [] } // Remove buttons
                })
            })
        }

        // Answer the callback query to remove loading state from button
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callbackQuery.id,
            text: answerText,
            show_alert: true
          })
        })
      }
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400 })
  }
})
