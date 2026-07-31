// js/pitch-details.js

const daysMap = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    
    const urlParams = new URLSearchParams(window.location.search);
    const pitchId = urlParams.get('id');
    
    if (!pitchId) {
        alert('معرف الملعب غير موجود');
        window.location.href = 'index.html';
        return;
    }
    
    loadPitchDetails(pitchId);
    
    const bookingForm = document.getElementById('bookingForm');
    if (bookingForm) bookingForm.addEventListener('submit', handleBookingSubmit);
    
    const recurringForm = document.getElementById('recurringForm');
    if (recurringForm) recurringForm.addEventListener('submit', handleRecurringSubmit);
});

async function loadPitchDetails(pitchId) {
    const container = document.getElementById('pitchDetailsContainer');
    const loading = document.getElementById('loadingIndicator');
    
    try {
        // Fetch pitch info
        const { data: pitch, error } = await supabase
            .from('pitches')
            .select('*')
            .eq('id', pitchId)
            .single();
            
        if (error) throw error;
        
        // Populate UI
        document.getElementById('pitchNameTitle').textContent = pitch.name;
        document.getElementById('pitchLocationText').textContent = pitch.location;
        document.getElementById('pitchPriceText').textContent = pitch.price_per_hour;
        window._pitchPrice = pitch.price_per_hour; // used by recurring modal
        
        const coverEl = document.getElementById('pitchCover');
        if (pitch.photos && pitch.photos.length > 0) {
            coverEl.style.backgroundImage = `url('${pitch.photos[0]}')`;
        } else {
            coverEl.style.backgroundImage = `url('https://via.placeholder.com/1200x400?text=بدون+صورة')`;
        }
        
        await renderAvailableSlots(pitchId);
        
        loading.style.display = 'none';
        container.style.display = 'block';
        
    } catch (error) {
        console.error(error);
        loading.innerHTML = `
            <i data-lucide="alert-triangle" style="width: 48px; height: 48px; color: #ef4444; margin-bottom: 10px;"></i>
            <h3 style="color: #ef4444;">حدث خطأ أو الملعب غير متاح</h3>
            <p>${error.message}</p>
            <a href="index.html" class="btn btn-outline" style="margin-top: 20px;">العودة للرئيسية</a>
        `;
        lucide.createIcons();
    }
}

async function renderAvailableSlots(pitchId) {
    const slotsContainer = document.getElementById('slotsContainer');
    const noSlotsMsg = document.getElementById('noSlotsMsg');
    
    // 1. Fetch all active slot templates for this pitch
    const { data: slots, error: slotsError } = await supabase
        .from('slots')
        .select('*')
        .eq('pitch_id', pitchId)
        .eq('is_active', true);
        
    if (slotsError || !slots || slots.length === 0) {
        slotsContainer.style.display = 'none';
        noSlotsMsg.style.display = 'block';
        return;
    }
    
    // 2. Generate next 7 days dates
    const today = new Date();
    today.setHours(0,0,0,0);
    const next7Days = [];
    for(let i = 0; i <= 6; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        // Format to YYYY-MM-DD local
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        
        next7Days.push({
            dateObj: d,
            dayOfWeek: d.getDay(),
            dateStr: `${year}-${month}-${day}`
        });
    }
    
    // 3. Fetch all bookings for these slots from today onwards
    const slotIds = slots.map(s => s.id);
    const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('slot_id, booking_date, status, created_at')
        .in('slot_id', slotIds)
        .gte('booking_date', next7Days[0].dateStr)
        .lte('booking_date', next7Days[6].dateStr);
        
    const activeBookings = bookings || [];
    
    // 4. Match slots to dates and filter out booked ones
    const availableSlotCards = [];
    const nowTime = new Date();
    
    next7Days.forEach(dayInfo => {
        // Find slots for this day of week
        const daySlots = slots.filter(s => s.day_of_week === dayInfo.dayOfWeek);
        
        // Sort them by start time
        daySlots.sort((a, b) => a.start_time.localeCompare(b.start_time));
        
        daySlots.forEach(slot => {
            // Check if slot time has already passed if it's today
            if (dayInfo.dateStr === next7Days[0].dateStr) {
                const [h, m] = slot.start_time.split(':');
                const slotTime = new Date(today);
                slotTime.setHours(h, m, 0);
                if (slotTime < nowTime) {
                    return; // skip past slots today
                }
            }
            
            // Check if there is a blocking booking
            const isBooked = activeBookings.some(b => {
                if (b.slot_id !== slot.id || b.booking_date !== dayInfo.dateStr) return false;
                
                if (b.status === 'confirmed') return true;
                
                if (b.status === 'pending_payment') {
                    // Check if 10 minutes hold has expired
                    const createdDate = new Date(b.created_at);
                    const diffMins = (nowTime - createdDate) / 60000;
                    if (diffMins <= 10) return true; // still on hold
                }
                return false;
            });
            
            if (!isBooked) {
                availableSlotCards.push({
                    slot,
                    dateInfo: dayInfo
                });
            }
        });
    });
    
    if (availableSlotCards.length === 0) {
        slotsContainer.style.display = 'none';
        noSlotsMsg.style.display = 'block';
        noSlotsMsg.querySelector('p').textContent = "جميع المواعيد محجوزة للأيام القادمة.";
        return;
    }
    
    // 5. Render to UI
    noSlotsMsg.style.display = 'none';
    slotsContainer.style.display = 'grid';
    slotsContainer.innerHTML = '';
    
    availableSlotCards.forEach(item => {
        const el = document.createElement('div');
        el.className = 'slot-card';
        
        const formatTime = (timeStr) => {
            const [h, m] = timeStr.split(':');
            const d = new Date();
            d.setHours(h, m);
            return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        };
        
        const displayDate = item.dateInfo.dateObj.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
        const dayName = daysMap[item.dateInfo.dayOfWeek];
        const startF = formatTime(item.slot.start_time);
        const endF = formatTime(item.slot.end_time);
        
        el.innerHTML = `
            <div class="slot-day" style="font-size: 1rem;">${dayName} ${displayDate}</div>
            <div class="slot-time" style="justify-content: center; font-size: 0.95rem; margin-top: 5px;">
                ${startF} - ${endF}
            </div>
            <button class="btn btn-outline btn-full" style="margin-top: 15px; font-size: 0.9rem; padding: 8px;" 
                onclick="openBookingModal('${item.slot.id}', '${item.dateInfo.dateStr}', '${dayName}', '${displayDate}', '${startF}', '${endF}')">
                احجز هذا الموعد
            </button>
            <button class="btn btn-full" style="margin-top: 8px; font-size: 0.85rem; padding: 7px; background: rgba(139,92,246,0.15); border: 1px solid #8b5cf6; color: #8b5cf6; border-radius: 8px; cursor: pointer;" 
                onclick="openRecurringModal('${item.slot.id}', '${dayName}', '${startF}', '${endF}', window._pitchPrice || 0)">
                🔁 حجز أسبوعي ثابت
            </button>
        `;
        slotsContainer.appendChild(el);
    });
}

function openBookingModal(slotId, dateStr, dayName, displayDate, startTime, endTime) {
    document.getElementById('modalSlotId').value = slotId;
    document.getElementById('modalBookingDate').value = dateStr;
    
    document.getElementById('bookingSlotInfo').innerHTML = `
        <i data-lucide="calendar" style="width: 16px; height: 16px; vertical-align: middle;"></i> الموعد: ${dayName} ${displayDate} <br>
        <i data-lucide="clock" style="width: 16px; height: 16px; vertical-align: middle;"></i> الوقت: ${startTime} إلى ${endTime}
    `;
    
    document.getElementById('bookingModal').style.display = 'flex';
    lucide.createIcons();
}

function closeBookingModal() {
    document.getElementById('bookingModal').style.display = 'none';
    document.getElementById('bookingForm').reset();
    document.getElementById('bookingError').textContent = '';
}

async function handleBookingSubmit(e) {
    e.preventDefault();
    
    const btn = document.getElementById('confirmBookingBtn');
    const errorDiv = document.getElementById('bookingError');
    
    const slotId = document.getElementById('modalSlotId').value;
    const bookingDate = document.getElementById('modalBookingDate').value;
    const name = document.getElementById('customerName').value.trim();
    const phone = document.getElementById('customerPhone').value.trim();
    
    if (phone.length < 10) {
        errorDiv.textContent = "يرجى إدخال رقم موبايل صحيح.";
        return;
    }
    
    errorDiv.textContent = '';
    btn.disabled = true;
    btn.innerHTML = 'جاري تأكيد الحجز...';
    
    try {
        const { data: existing } = await supabase
            .from('bookings')
            .select('id, status, created_at')
            .eq('slot_id', slotId)
            .eq('booking_date', bookingDate);
            
        if (existing && existing.length > 0) {
            const now = new Date();
            const isBlocked = existing.some(b => {
                if (b.status === 'confirmed') return true;
                if (b.status === 'pending_payment') {
                    const diff = (now - new Date(b.created_at)) / 60000;
                    return diff <= 10;
                }
                return false;
            });
            if (isBlocked) throw new Error("عذراً، لقد قام شخص آخر بحجز هذا الموعد للتو. يرجى اختيار موعد آخر.");
        }
        
        const { data: newBooking, error: insertErr } = await supabase
            .from('bookings')
            .insert([{
                slot_id: slotId,
                booking_date: bookingDate,
                customer_name: name,
                customer_phone: phone,
                status: 'pending_payment',
                source: 'online'
            }])
            .select()
            .single();
            
        if (insertErr) throw insertErr;
        window.location.href = `pay-booking.html?id=${newBooking.id}`;
        
    } catch (error) {
        errorDiv.textContent = error.message;
        btn.disabled = false;
        btn.innerHTML = 'تأكيد مبدئي والانتقال للدفع';
    }
}

// ============================
// Recurring Booking Functions
// ============================

function openRecurringModal(slotId, dayName, startTime, endTime, pitchPrice) {
    document.getElementById('recurringSlotId').value = slotId;
    document.getElementById('recurringSlotInfo').textContent = `كل ${dayName} — ${startTime} إلى ${endTime}`;
    const deposit = Math.round(Number(pitchPrice) * 0.5);
    document.getElementById('recurringDepositAmount').textContent = deposit;
    document.getElementById('recurringModal').style.display = 'flex';
}

window.openRecurringModal = openRecurringModal;

function closeRecurringModal() {
    document.getElementById('recurringModal').style.display = 'none';
    document.getElementById('recurringForm').reset();
    document.getElementById('recurringError').textContent = '';
}

window.closeRecurringModal = closeRecurringModal;

async function handleRecurringSubmit(e) {
    e.preventDefault();
    
    const btn = document.getElementById('confirmRecurringBtn');
    const errorDiv = document.getElementById('recurringError');
    const slotId = document.getElementById('recurringSlotId').value;
    const name = document.getElementById('recurringName').value.trim();
    const phone = document.getElementById('recurringPhone').value.trim();
    const depositAmount = parseFloat(document.getElementById('recurringDepositAmount').textContent) || 0;
    
    if (phone.length < 10) {
        errorDiv.textContent = "يرجى إدخال رقم موبايل صحيح.";
        return;
    }
    
    errorDiv.textContent = '';
    btn.disabled = true;
    btn.innerHTML = 'جاري التسجيل...';
    
    try {
        // Get pitch_id from slot
        const { data: slot, error: slotErr } = await supabase
            .from('slots')
            .select('pitch_id')
            .eq('id', slotId)
            .single();
        if (slotErr) throw slotErr;
        
        // Check if slot already has an active recurring booking
        const { data: existingRecurring } = await supabase
            .from('recurring_bookings')
            .select('id')
            .eq('slot_id', slotId)
            .eq('status', 'active');
            
        if (existingRecurring && existingRecurring.length > 0) {
            throw new Error("هذا الموعد محجوز أسبوعياً بالفعل من عميل آخر. يرجى اختيار موعد مختلف.");
        }
        
        // Create recurring booking record
        const { data: newRecurring, error: insertErr } = await supabase
            .from('recurring_bookings')
            .insert([{
                customer_phone: phone,
                customer_name: name,
                pitch_id: slot.pitch_id,
                slot_id: slotId,
                deposit_amount: depositAmount,
                status: 'active'
            }])
            .select()
            .single();
            
        if (insertErr) throw insertErr;
        
        // Redirect to pay deposit page
        window.location.href = `pay-deposit.html?id=${newRecurring.id}`;
        
    } catch (error) {
        errorDiv.textContent = error.message;
        btn.disabled = false;
        btn.innerHTML = 'متابعة لدفع العربون';
    }
}
