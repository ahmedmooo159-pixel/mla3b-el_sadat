// js/pay-booking.js

document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();
    
    const urlParams = new URLSearchParams(window.location.search);
    const bookingId = urlParams.get('id');
    
    if (!bookingId) {
        alert("معرف الحجز غير موجود.");
        window.location.href = 'index.html';
        return;
    }
    
    await loadPaymentDetails(bookingId);
    
    const uploadForm = document.getElementById('uploadReceiptForm');
    if (uploadForm) {
        uploadForm.addEventListener('submit', (e) => handleReceiptUpload(e, bookingId));
    }
});

async function loadPaymentDetails(bookingId) {
    const loading = document.getElementById('loadingIndicator');
    const content = document.getElementById('paymentContent');
    
    try {
        // Fetch booking — include pitch_id for free-range bookings (no slot_id)
        const { data: booking, error: bookingErr } = await supabaseClient
            .from('bookings')
            .select(`
                id, status, created_at, pitch_id, start_time, end_time, slot_id,
                slots (
                    start_time, end_time,
                    pitches (
                        price_per_hour, vodafone_cash, instapay_link
                    )
                )
            `)
            .eq('id', bookingId)
            .single();
            
        if (bookingErr) throw bookingErr;
        
        if (booking.status === 'confirmed') {
            loading.style.display = 'none';
            document.getElementById('successContent').style.display = 'block';
            return;
        }
        
        // Check if 10 min hold expired
        const now = new Date();
        const diff = (now - new Date(booking.created_at)) / 60000;
        if (diff > 10) {
            loading.innerHTML = `
                <i data-lucide="x-circle" style="width: 48px; height: 48px; color: #ef4444; margin-bottom: 10px;"></i>
                <h3 style="color: #ef4444;">انتهت مهلة الدفع</h3>
                <p>لقد مر أكثر من 10 دقائق ولم يتم رفع إيصال الدفع. تم إلغاء الحجز المبدئي وإعادة إتاحة الموعد للجميع.</p>
                <a href="index.html" class="btn btn-outline" style="margin-top: 20px;">العودة للرئيسية</a>
            `;
            lucide.createIcons();
            await supabaseClient.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId);
            localStorage.removeItem('pending_booking');
            return;
        }
        
        // Resolve pitch data — slot-based booking OR free-range booking (pitch_id only)
        let pitch = booking.slots?.pitches || null;

        if (!pitch && booking.pitch_id) {
            // Free-range booking: fetch pitch directly
            const { data: pitchData, error: pitchErr } = await supabaseClient
                .from('pitches')
                .select('price_per_hour, vodafone_cash, instapay_link')
                .eq('id', booking.pitch_id)
                .single();
            if (pitchErr) throw pitchErr;
            pitch = pitchData;
        }

        if (!pitch) throw new Error('تعذّر تحميل بيانات الملعب.');

        // --- Calculate & display total amount ---
        const pricePerHour = pitch.price_per_hour || 0;
        // Prefer booking's own start/end; fallback to slot's times
        const startT = booking.start_time || booking.slots?.start_time;
        const endT   = booking.end_time   || booking.slots?.end_time;
        if (startT && endT && pricePerHour > 0) {
            const toMins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
            let sMins = toMins(startT);
            let eMins = toMins(endT);
            if (eMins <= sMins) eMins += 24 * 60; // overnight
            const durationHrs = (eMins - sMins) / 60;
            const totalAmount = Math.round(durationHrs * pricePerHour);
            const amountEl = document.getElementById('totalAmountBox');
            if (amountEl) {
                amountEl.innerHTML = `
                    <i data-lucide="banknote" style="width:22px;height:22px;vertical-align:middle;color:var(--primary-color);"></i>
                    <span style="font-size:1.1rem;"> المبلغ المطلوب تحويله: </span>
                    <strong style="font-size:1.6rem; color:var(--primary-color);">${totalAmount.toLocaleString('ar-EG')}</strong>
                    <span style="font-size:1rem;"> جنيه</span>
                    <div style="font-size:0.85rem; color:var(--text-muted); margin-top:5px;">${durationHrs} ساعة × ${pricePerHour.toLocaleString('ar-EG')} جنيه/ساعة</div>
                `;
                amountEl.style.display = 'block';
                lucide.createIcons();
            }
        }
        // -----------------------------------------

        document.getElementById('vCashNum').textContent = pitch.vodafone_cash || 'غير محدد من المالك';
        if (pitch.instapay_link) {
            document.getElementById('instaPayDiv').style.display = 'block';
            document.getElementById('instaLink').textContent = pitch.instapay_link;
        }
        
        loading.style.display = 'none';
        content.style.display = 'block';
        
    } catch (err) {
        console.error(err);
        loading.textContent = "حدث خطأ أثناء تحميل البيانات: " + err.message;
    }
}


async function handleReceiptUpload(e, bookingId) {
    e.preventDefault();
    
    const btn = document.getElementById('submitReceiptBtn');
    const errorDiv = document.getElementById('uploadError');
    const successDiv = document.getElementById('uploadSuccess');
    const fileInput = document.getElementById('receiptImage');
    
    errorDiv.textContent = '';
    
    if (fileInput.files.length === 0) {
        errorDiv.textContent = "الرجاء اختيار صورة الإيصال.";
        return;
    }
    
    const file = fileInput.files[0];
    
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" style="animation: spin 2s linear infinite;"></i> جاري الرفع والتأكيد...';
    
    try {
        // Upload to Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${bookingId}-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabaseClient.storage
            .from('booking_receipts')
            .upload(fileName, file);
            
        if (uploadError) throw new Error("فشل في رفع الصورة: " + uploadError.message);
        
        const { data: publicUrlData } = supabaseClient.storage
            .from('booking_receipts')
            .getPublicUrl(fileName); // Even if bucket is false public, usually we just store the path, but let's store path.
            
        const filePath = fileName; 
        
        // Update booking status via RPC (bypasses RLS for anon users)
        const { error: updateError } = await supabaseClient
            .rpc('upload_booking_receipt', {
                p_booking_id: bookingId,
                p_screenshot: filePath
            });
            
        if (updateError) throw new Error("تم الرفع ولكن حدث خطأ في تحديث الحجز: " + updateError.message);
        
        localStorage.removeItem('pending_booking');
        
        document.getElementById('paymentContent').style.display = 'none';
        document.getElementById('successContent').style.display = 'block';
        
        // Notify Telegram via Edge Function
        try {
            await supabaseClient.functions.invoke('notify-owner-booking', {
                body: { booking_id: bookingId }
            });
        } catch (ignore) { console.log('Telegram notify failed, ignoring for now'); }
        
    } catch (err) {
        errorDiv.textContent = err.message;
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="upload"></i> رفع الإيصال وتأكيد الحجز';
        lucide.createIcons();
    }
}
