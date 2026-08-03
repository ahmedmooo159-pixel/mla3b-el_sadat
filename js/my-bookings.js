// js/my-bookings.js

const daysMap = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    
    const searchBtn = document.getElementById('searchBtn');
    const phoneInput = document.getElementById('phoneInput');
    
    if (searchBtn && phoneInput) {
        searchBtn.addEventListener('click', () => {
            const phone = phoneInput.value.trim();
            if (phone.length < 10) { alert("يرجى إدخال رقم هاتف صحيح"); return; }
            fetchAllBookings(phone);
        });
        phoneInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchBtn.click(); });
    }
    
    const cancelForm = document.getElementById('cancelBookingForm');
    if (cancelForm) cancelForm.addEventListener('submit', handleCancelSubmit);
});

async function fetchAllBookings(phone) {
    const loadingDiv = document.getElementById('loadingIndicator');
    document.getElementById('bookingsList').style.display = 'none';
    document.getElementById('noResults').style.display = 'none';
    document.getElementById('recurringSection').style.display = 'none';
    loadingDiv.style.display = 'block';
    
    try {
        // Fetch normal bookings
        const { data: bookings, error: bErr } = await supabaseClient
            .rpc('get_bookings_by_phone', { p_phone: phone })
            .select(`id, status, booking_date, start_time, end_time, created_at, payment_screenshot, slots(day_of_week, start_time, end_time, pitches(name, location, price_per_hour, cancel_cutoff_hours, refund_percent_after_cutoff))`)
            .neq('source', 'manual')
            .order('created_at', { ascending: false });
        
        // Fetch recurring bookings
        const { data: recurring, error: rErr } = await supabaseClient
            .rpc('get_recurring_bookings_by_phone', { p_phone: phone })
            .select(`*, slots(day_of_week, start_time, end_time, pitches(name, location)), recurring_occurrences(id, occurrence_date, status)`)
            .order('created_at', { ascending: false });
        
        loadingDiv.style.display = 'none';
        
        const hasBookings = bookings && bookings.length > 0;
        const hasRecurring = recurring && recurring.length > 0;
        
        if (!hasBookings && !hasRecurring) {
            document.getElementById('noResults').style.display = 'block';
            return;
        }
        
        if (hasBookings) renderBookings(bookings);
        if (hasRecurring) renderRecurringSection(recurring);
        
    } catch (err) {
        console.error(err);
        loadingDiv.textContent = 'حدث خطأ أثناء التحميل.';
        loadingDiv.style.color = '#ef4444';
    }
}

function formatTimeDisplay(timeStr) {
    if (window.formatEgyptianTime) return window.formatEgyptianTime(timeStr);
    const [h, m] = timeStr.split(':');
    const d = new Date(); d.setHours(h, m);
    return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

function renderBookings(bookings) {
    const listDiv = document.getElementById('bookingsList');
    listDiv.innerHTML = '';
    
    const statusMap = {
        'pending_payment': { label: 'في انتظار الدفع', color: '#f59e0b', icon: 'clock' },
        'confirmed': { label: 'حجز مؤكد ✅', color: '#10b981', icon: 'check-circle' },
        'rejected': { label: 'مرفوض', color: '#ef4444', icon: 'x-circle' },
        'cancelled': { label: 'تم الإلغاء', color: '#94a3b8', icon: 'x-circle' }
    };
    
    bookings.forEach(booking => {
        const slot = booking.slots;
        if (!slot) return;
        const pitch = slot.pitches;
        if (!pitch) return;
        
        let statusObj = statusMap[booking.status] || { label: booking.status, color: '#94a3b8', icon: 'info' };
        if (booking.status === 'pending_payment' && booking.payment_screenshot) {
            statusObj = { label: 'تم تأكيد الحجز 🎉', color: '#10b981', icon: 'check-circle' };
        }
        const bookingDate = new Date(booking.booking_date).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        const startT = booking.start_time || slot.start_time;
        const endT = booking.end_time || slot.end_time;
        let cancelBtn = '';
        if (booking.status === 'confirmed' || (booking.status === 'pending_payment' && booking.payment_screenshot)) {
            const cutoff = pitch.cancel_cutoff_hours || 24;
            const refundPct = pitch.refund_percent_after_cutoff ?? 0;
            const matchDateTime = new Date(booking.booking_date + 'T' + startT);
            const hoursToMatch = (matchDateTime - new Date()) / 3600000;
            const refundPercent = hoursToMatch >= cutoff ? 100 : refundPct;
            const refundAmount = Math.round((pitch.price_per_hour * refundPercent) / 100);
            const policyText = hoursToMatch >= cutoff
                ? `الإلغاء قبل ${cutoff} ساعة — استرداد 100% (${pitch.price_per_hour} جنيه)`
                : `الإلغاء بعد المهلة — استرداد ${refundPct}% (${refundAmount} جنيه)`;
            cancelBtn = `<button class="btn" style="margin-top: 10px; background: transparent; border: 1px solid #ef4444; color: #ef4444; border-radius: 8px; padding: 8px 15px; cursor: pointer; font-family: inherit; font-size: 0.9rem; width: 100%;" onclick="openCancelModal('${booking.id}', '${pitch.name}', ${refundAmount}, '${policyText.replace(/'/g, "&apos;")}')"><i data-lucide="x-circle" style="width: 16px; height: 16px; vertical-align: middle;"></i> طلب إلغاء الحجز</button>`;
        }

        let payBtn = '';
        if (booking.status === 'pending_payment') {
            if (booking.payment_screenshot) {
                payBtn = `<p style="color: #10b981; font-size: 0.85rem; margin-top: 10px; text-align: center; font-weight: bold;">✅ تم رفع الإيصال وتم تأكيد الحجز.</p>`;
            } else {
                const now = new Date();
                const minsPassed = (now - new Date(booking.created_at)) / 60000;
                if (minsPassed <= 10) {
                    payBtn = `<a href="pay-booking.html?id=${booking.id}" class="btn btn-primary" style="margin-top: 10px; width: 100%; text-decoration: none; display: block; text-align: center;"><i data-lucide="upload-cloud" style="width: 16px; height: 16px; vertical-align: middle;"></i> رفع إيصال الدفع (متبقي ${Math.max(0, Math.ceil(10 - minsPassed))} دقيقة)</a>`;
                } else {
                    payBtn = `<p style="color: #ef4444; font-size: 0.85rem; margin-top: 10px; text-align: center; font-weight: bold;">⚠️ انتهت مهلة الدفع (10 دقائق)</p>`;
                }
            }
        }
        
        const card = document.createElement('div');
        card.className = 'animate-fade-in';
        card.style.cssText = 'background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 20px; display: flex; flex-direction: column;';
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px; border-bottom: 1px solid var(--border-color); padding-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                <div>
                    <h3 style="color: var(--primary-color); margin-bottom: 5px;">${pitch.name}</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">${pitch.location}</p>
                </div>
                <div style="background-color: ${statusObj.color}20; color: ${statusObj.color}; padding: 6px 12px; border-radius: 8px; font-weight: bold; font-size: 0.85rem; border: 1px solid ${statusObj.color}50;">
                    ${statusObj.label}
                </div>
            </div>
            <p style="margin-bottom: 8px; font-weight: 600;"><i data-lucide="calendar" style="width:16px;height:16px;color:var(--text-muted);vertical-align:middle;"></i> ${bookingDate}</p>
            <p style="font-weight: 600;"><i data-lucide="clock" style="width:16px;height:16px;color:var(--text-muted);vertical-align:middle;"></i> ${formatTimeDisplay(startT)} - ${formatTimeDisplay(endT)}</p>
            ${cancelBtn}
            ${payBtn}
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-color);">
                <p style="font-size: 0.8rem; color: var(--text-muted);">رقم الحجز: #${booking.id.split('-')[0]}</p>
            </div>
        `;
        listDiv.appendChild(card);
    });
    
    listDiv.style.display = 'grid';
    lucide.createIcons();
}

function renderRecurringSection(recurring) {
    const section = document.getElementById('recurringSection');
    const container = document.getElementById('recurringList');
    container.innerHTML = '';
    
    recurring.forEach(rb => {
        const slot = rb.slots;
        if (!slot) return;
        const pitch = slot.pitches;
        
        // Sort occurrences by date descending
        const occurrences = (rb.recurring_occurrences || []).sort((a, b) => new Date(b.occurrence_date) - new Date(a.occurrence_date));
        const latestOccurrence = occurrences[0];
        
        const statusBadge = rb.status === 'active'
            ? '<span style="background:rgba(16,185,129,0.2);color:#10b981;padding:4px 10px;border-radius:6px;font-size:0.8rem;">نشط</span>'
            : '<span style="background:rgba(239,68,68,0.2);color:#ef4444;padding:4px 10px;border-radius:6px;font-size:0.8rem;">ملغي</span>';
        
        let occurrenceHtml = '';
        if (latestOccurrence) {
            const occDate = new Date(latestOccurrence.occurrence_date).toLocaleDateString('ar-EG', { weekday: 'long', month: 'long', day: 'numeric' });
            const occStatusMap = {
                'awaiting_confirmation': { label: 'في انتظار التأكيد والدفع', color: '#f59e0b' },
                'confirmed': { label: 'مدفوع ومؤكد ✅', color: '#10b981' },
                'skipped': { label: 'تم تخطي هذا الأسبوع', color: '#94a3b8' }
            };
            const occStatus = occStatusMap[latestOccurrence.status] || { label: latestOccurrence.status, color: '#94a3b8' };
            
            const payBtn = latestOccurrence.status === 'awaiting_confirmation'
                ? `<a href="pay-weekly.html?id=${latestOccurrence.id}" class="btn" style="background:#10b981;color:white;padding:8px 15px;border-radius:8px;font-size:0.85rem;text-decoration:none;display:inline-block;margin-top:8px;">دفع هذا الأسبوع</a>`
                : '';
            
            const cancelOccBtn = `<button class="btn" style="background:transparent;border:1px solid #ef4444;color:#ef4444;padding:8px 15px;border-radius:8px;font-size:0.85rem;display:inline-block;margin-top:8px;margin-right:5px;cursor:pointer;" onclick="cancelOccurrence('${latestOccurrence.id}')">إلغاء هذا الأسبوع</button>`;
            
            occurrenceHtml = `
                <div style="margin-top:12px;padding:12px;background:rgba(255,255,255,0.05);border-radius:10px;border:1px solid var(--border-color);">
                    <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:5px;">موعد هذا الأسبوع: <strong>${occDate}</strong></p>
                    <p style="font-size:0.85rem;"><span style="color:${occStatus.color}">${occStatus.label}</span></p>
                    ${payBtn}
                    ${cancelOccBtn}
                </div>
            `;
        }
        
        let cancelRecBtn = rb.status === 'active' 
            ? `<button class="btn" style="background:transparent;border:1px solid #ef4444;color:#ef4444;padding:8px 15px;border-radius:8px;font-size:0.85rem;width:100%;margin-top:12px;cursor:pointer;" onclick="cancelRecurringBooking('${rb.id}')">إلغاء الاشتراك الأسبوعي نهائياً</button>` 
            : '';

        const card = document.createElement('div');
        card.className = 'animate-fade-in';
        card.style.cssText = 'background: linear-gradient(135deg, rgba(139,92,246,0.1), rgba(59,130,246,0.05)); border: 1px solid #8b5cf6; border-radius: 16px; padding: 20px;';
        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
                <div>
                    <h3 style="color:#8b5cf6;margin-bottom:3px;">🔁 ${pitch?.name || 'ملعب'}</h3>
                    <p style="color:var(--text-muted);font-size:0.9rem;">${pitch?.location || ''}</p>
                </div>
                ${statusBadge}
            </div>
            <p style="margin-bottom:6px;font-weight:600;"><i data-lucide="repeat" style="width:16px;height:16px;color:#8b5cf6;vertical-align:middle;"></i> كل ${daysMap[slot.day_of_week]} — ${formatTimeDisplay(slot.start_time)} إلى ${formatTimeDisplay(slot.end_time)}</p>
            <p style="font-size:0.9rem;color:var(--text-muted);">العربون المدفوع: <strong style="color:#8b5cf6;">${rb.deposit_amount} جنيه</strong></p>
            ${occurrenceHtml}
            ${cancelRecBtn}
        `;
        container.appendChild(card);
    });
    
    section.style.display = 'block';
    lucide.createIcons();
}

// Cancel Modal
function openCancelModal(bookingId, pitchName, refundAmount, policyText) {
    document.getElementById('cancelBookingId').value = bookingId;
    document.getElementById('cancelPitchName').textContent = pitchName;
    document.getElementById('cancelRefundAmount').textContent = refundAmount;
    document.getElementById('cancelPolicyText').textContent = policyText;
    document.getElementById('cancelModal').style.display = 'flex';
}
window.openCancelModal = openCancelModal;

window.closeCancelModal = function() {
    document.getElementById('cancelModal').style.display = 'none';
    document.getElementById('cancelBookingForm').reset();
    document.getElementById('cancelError').textContent = '';
};

async function handleCancelSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('confirmCancelBtn');
    const errorDiv = document.getElementById('cancelError');
    const bookingId = document.getElementById('cancelBookingId').value;
    const walletNum = document.getElementById('refundWalletNumber').value.trim();
    const refundAmount = parseFloat(document.getElementById('cancelRefundAmount').textContent) || 0;
    
    if (walletNum.length < 10) { errorDiv.textContent = 'يرجى إدخال رقم محفظة صحيح.'; return; }
    errorDiv.textContent = '';
    btn.disabled = true;
    btn.textContent = 'جاري الإلغاء...';
    
    try {
        const { error: cancelErr } = await supabaseClient.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId);
        if (cancelErr) throw cancelErr;
        
        if (refundAmount > 0) {
            await supabaseClient.from('refund_requests').insert([{ booking_id: bookingId, refund_amount: refundAmount, wallet_number: walletNum, status: 'pending' }]);
        }
        
        try {
            await supabaseClient.functions.invoke('notify-owner-refund', { body: { booking_id: bookingId, refund_amount: refundAmount, wallet_number: walletNum } });
        } catch (ignore) {}
        
        window.closeCancelModal();
        alert('تم إلغاء الحجز بنجاح. سيتواصل معك المالك لاسترداد المبلغ إن وجد.');
        const phone = document.getElementById('phoneInput').value.trim();
        if (phone) fetchAllBookings(phone);
        
    } catch (err) {
        errorDiv.textContent = 'حدث خطأ: ' + err.message;
        btn.disabled = false;
        btn.textContent = 'تأكيد الإلغاء';
    }
}

window.cancelOccurrence = async function(occurrenceId) {
    if (!confirm('تأكيد إلغاء حجز هذا الأسبوع وتخطيه؟')) return;
    
    try {
        const { error } = await supabaseClient
            .from('recurring_occurrences')
            .update({ status: 'skipped' })
            .eq('id', occurrenceId);
            
        if (error) throw error;
        alert('تم التخطي بنجاح.');
        const phone = document.getElementById('phoneInput').value.trim();
        if (phone) fetchAllBookings(phone);
    } catch (err) {
        alert('حدث خطأ: ' + err.message);
    }
};

window.cancelRecurringBooking = async function(recurringId) {
    if (!confirm('هل أنت متأكد من إلغاء الاشتراك الأسبوعي نهائياً؟ قد لا تسترد العربون المدفوع إلا بموافقة المالك.')) return;
    
    try {
        const { error } = await supabaseClient
            .from('recurring_bookings')
            .update({ status: 'cancelled' })
            .eq('id', recurringId);
            
        if (error) throw error;
        alert('تم إلغاء الاشتراك الأسبوعي بنجاح.');
        const phone = document.getElementById('phoneInput').value.trim();
        if (phone) fetchAllBookings(phone);
    } catch (err) {
        alert('حدث خطأ: ' + err.message);
    }
};
