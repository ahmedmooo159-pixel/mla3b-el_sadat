// js/pay-deposit.js

const daysMap = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();
    
    const urlParams = new URLSearchParams(window.location.search);
    const recurringId = urlParams.get('id');
    
    if (!recurringId) {
        alert("معرف الحجز غير موجود.");
        window.location.href = 'index.html';
        return;
    }
    
    await loadDepositDetails(recurringId);
    
    const form = document.getElementById('depositUploadForm');
    if (form) form.addEventListener('submit', (e) => handleDepositUpload(e, recurringId));
});

async function loadDepositDetails(recurringId) {
    const loading = document.getElementById('loadingIndicator');
    const content = document.getElementById('depositContent');
    
    try {
        const { data: rb, error } = await supabaseClient
            .from('recurring_bookings')
            .select(`
                id, customer_name, deposit_amount, status, deposit_screenshot,
                slots (
                    day_of_week, start_time, end_time,
                    pitches (
                        name, vodafone_cash, instapay_link
                    )
                )
            `)
            .eq('id', recurringId)
            .single();
            
        if (error) throw error;
        
        // Already uploaded?
        if (rb.deposit_screenshot) {
            loading.style.display = 'none';
            document.getElementById('successContent').style.display = 'block';
            return;
        }
        
        const slot = rb.slots;
        const pitch = slot.pitches;
        
        const formatTime = (t) => {
            const [h, m] = t.split(':');
            const d = new Date(); d.setHours(h, m);
            return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        };
        
        document.getElementById('depositPitchName').textContent = pitch.name;
        document.getElementById('depositSlotInfo').textContent = `كل ${daysMap[slot.day_of_week]} من ${formatTime(slot.start_time)} إلى ${formatTime(slot.end_time)}`;
        document.getElementById('depositAmount').textContent = rb.deposit_amount;
        document.getElementById('pitchVCash').textContent = pitch.vodafone_cash || 'غير محدد';
        
        if (pitch.instapay_link) {
            document.getElementById('pitchInstaDiv').style.display = 'block';
            document.getElementById('pitchInstaPay').textContent = pitch.instapay_link;
        }
        
        loading.style.display = 'none';
        content.style.display = 'block';
        
    } catch (err) {
        console.error(err);
        document.getElementById('loadingIndicator').innerHTML = `
            <p style="color:#ef4444;">حدث خطأ في تحميل التفاصيل: ${err.message}</p>
            <a href="index.html" class="btn btn-outline" style="margin-top:20px;">العودة للرئيسية</a>
        `;
    }
}

async function handleDepositUpload(e, recurringId) {
    e.preventDefault();
    
    const btn = document.getElementById('submitDepositBtn');
    const errorDiv = document.getElementById('depositError');
    const fileInput = document.getElementById('depositImage');
    
    errorDiv.textContent = '';
    
    if (!fileInput.files.length) {
        errorDiv.textContent = "يرجى اختيار صورة الإيصال.";
        return;
    }
    
    btn.disabled = true;
    btn.innerHTML = 'جاري الرفع والتثبيت...';
    
    try {
        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `deposit-${recurringId}-${Date.now()}.${fileExt}`;
        
        const { error: uploadErr } = await supabaseClient.storage
            .from('booking_receipts')
            .upload(fileName, file);
        if (uploadErr) throw new Error("فشل رفع الصورة: " + uploadErr.message);
        
        // Update recurring booking with deposit screenshot
        const { error: updateErr } = await supabaseClient
            .from('recurring_bookings')
            .update({ deposit_screenshot: fileName })
            .eq('id', recurringId);
        if (updateErr) throw new Error("تم الرفع لكن فشل التحديث: " + updateErr.message);
        
        // Create the first upcoming occurrence for confirmation
        const nextDate = getNextWeekDate(new Date());
        await supabaseClient
            .from('recurring_occurrences')
            .insert([{
                recurring_booking_id: recurringId,
                occurrence_date: nextDate,
                status: 'awaiting_confirmation'
            }]);
        
        // Notify owner via Edge Function
        try {
            await supabaseClient.functions.invoke('notify-owner-deposit', {
                body: { recurring_id: recurringId }
            });
        } catch (ignore) {}
        
        document.getElementById('depositContent').style.display = 'none';
        document.getElementById('successContent').style.display = 'block';
        
    } catch (err) {
        errorDiv.textContent = err.message;
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="upload"></i> رفع الإيصال وتثبيت الحجز الأسبوعي';
        lucide.createIcons();
    }
}

function getNextWeekDate(from) {
    const d = new Date(from);
    d.setDate(d.getDate() + 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
