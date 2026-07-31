import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * auto-release-weekly
 * 
 * This function should be run daily via a Supabase Cron Job.
 * Setup via Supabase Dashboard > Database > Extensions > pg_cron, then:
 * 
 *   SELECT cron.schedule(
 *     'daily-auto-release-weekly',
 *     '0 6 * * *',  -- runs every day at 6 AM UTC
 *     $$
 *     SELECT net.http_post(
 *       url := 'https://<YOUR_PROJECT>.supabase.co/functions/v1/auto-release-weekly',
 *       headers := '{"Authorization": "Bearer <YOUR_ANON_KEY>"}'::jsonb,
 *       body := '{}'::jsonb
 *     )
 *     $$
 *   );
 *
 * What it does:
 * - Finds all recurring_occurrences with status = 'awaiting_confirmation'
 * - For those whose occurrence_date is <= today - confirm_cutoff_days, marks them as 'skipped'
 * - Creates the next week's occurrence for any active recurring booking
 */

serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]

    // 1. Find overdue occurrences (awaiting confirmation but past the cutoff)
    const { data: overdueOccurrences } = await supabase
      .from('recurring_occurrences')
      .select(`
        id, occurrence_date, recurring_booking_id,
        recurring_bookings!inner (
          id, status, confirm_cutoff_days, slot_id,
          slots (
            day_of_week, start_time, end_time,
            pitches ( name )
          )
        )
      `)
      .eq('status', 'awaiting_confirmation')
      .eq('recurring_bookings.status', 'active')

    let skippedCount = 0

    for (const occ of overdueOccurrences || []) {
      const rb = occ.recurring_bookings
      const cutoffDays = rb.confirm_cutoff_days || 4
      
      const occDate = new Date(occ.occurrence_date)
      const cutoffDate = new Date(occDate)
      cutoffDate.setDate(occDate.getDate() - cutoffDays)
      
      // If today is past the cutoff date (i.e., not enough time left to confirm)
      if (today >= cutoffDate) {
        await supabase
          .from('recurring_occurrences')
          .update({ status: 'skipped' })
          .eq('id', occ.id)
        skippedCount++
      }
    }

    // 2. Create next week's occurrence for all active recurring bookings that don't have one yet
    const { data: activeRecurring } = await supabase
      .from('recurring_bookings')
      .select('id, slot_id, slots(day_of_week)')
      .eq('status', 'active')

    let createdCount = 0

    for (const rb of activeRecurring || []) {
      if (!rb.slots) continue
      
      // Calculate next occurrence date
      const targetDay = rb.slots.day_of_week
      const next = new Date(today)
      const diff = (targetDay - today.getDay() + 7) % 7
      next.setDate(today.getDate() + (diff === 0 ? 7 : diff))
      const nextStr = next.toISOString().split('T')[0]
      
      // Check if already exists
      const { data: existing } = await supabase
        .from('recurring_occurrences')
        .select('id')
        .eq('recurring_booking_id', rb.id)
        .eq('occurrence_date', nextStr)
        .single()
      
      if (!existing) {
        await supabase
          .from('recurring_occurrences')
          .insert([{
            recurring_booking_id: rb.id,
            occurrence_date: nextStr,
            status: 'awaiting_confirmation'
          }])
        createdCount++
      }
    }

    return new Response(
      JSON.stringify({ success: true, skipped: skippedCount, created: createdCount }),
      { headers: { "Content-Type": "application/json" } }
    )

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
