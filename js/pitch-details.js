// js/pitch-details.js

const daysMap = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// Global state
// Global state
let _allSlots = [];
let _allBookings = [];
let _next7Days = [];
let currentSelectedDuration = 60; // المدة الافتراضية بالدقايق (ساعة واحدة)
let currentActiveDateStr = null;



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

    // Removed old picker event listeners
});

// ==========================================
// LOAD PITCH DATA
// ==========================================
async function loadPitchDetails(pitchId) {
    const container = document.getElementById('pitchDetailsContainer');
    const loading = document.getElementById('loadingIndicator');

    try {
        const { data: pitch, error } = await supabaseClient
            .from('pitches')
            .select('*, owners(full_name, phone)')
            .eq('id', pitchId)
            .single();

        if (error) throw error;

        document.getElementById('pitchNameTitle').textContent = pitch.name;
        document.getElementById('pitchLocationText').textContent = pitch.location;
        document.getElementById('pitchPriceText').textContent = pitch.price_per_hour;
        window._pitchPrice = pitch.price_per_hour;

        const coverEl = document.getElementById('pitchCover');
        if (pitch.photos && pitch.photos.length > 0) {
            coverEl.style.backgroundImage = `url('${pitch.photos[0]}')`;
        } else {
            coverEl.style.backgroundImage = `url('https://via.placeholder.com/1200x400?text=بدون+صورة')`;
        }

        const contactLink = document.getElementById('quickContactLink');
        if (contactLink) {
            if (pitch.owners?.phone) {
                contactLink.href = `tel:${pitch.owners.phone}`;
                contactLink.textContent = `اتصل الآن: ${pitch.owners.phone}`;
                contactLink.style.pointerEvents = 'auto';
            } else {
                contactLink.href = '#';
                contactLink.textContent = 'رقم التواصل غير موجود';
                contactLink.style.pointerEvents = 'none';
                contactLink.style.opacity = '0.6';
            }
        }

        await loadSlotsAndBookings(pitchId);

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

// ==========================================
// LOAD SLOTS + BOOKINGS ONCE
// ==========================================
async function loadSlotsAndBookings(pitchId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    _next7Days = [];
    for (let i = 0; i <= 6; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        _next7Days.push({
            dateObj: d,
            dayOfWeek: d.getDay(),
            dateStr: `${y}-${m}-${day}`
        });
    }

    const { data: slots, error: slotsError } = await supabaseClient
        .from('slots')
        .select('*')
        .eq('pitch_id', pitchId)
        .eq('is_active', true)
        .order('day_of_week')
        .order('start_time');

    if (slotsError || !slots || slots.length === 0) {
        document.getElementById('timePickerPanel').style.display = 'none';
        document.getElementById('noSlotsMsg').style.display = 'block';
        return;
    }

    _allSlots = slots;

    const slotIds = slots.map(s => s.id);
    const { data: bookings } = await supabaseClient
        .from('bookings')
        .select('id, slot_id, pitch_id, booking_date, start_time, end_time, status, created_at')
        .eq('pitch_id', pitchId)
        .gte('booking_date', _next7Days[0].dateStr)
        .lte('booking_date', _next7Days[6].dateStr);

    _allBookings = bookings || [];

    buildDaysTabs();
}

// Free-form picker removed in favor of tabbed slot selection

// ==========================================
// BOOKING MODAL
function openBookingModal(slotId, dateStr, dayName, displayDate, startF, endF, rawStart, rawEnd, price) {
    window._pickerBookingData = { dateStr, startTime: rawStart, endTime: rawEnd, slotId, price };
    document.getElementById('modalSlotId').value = slotId;
    document.getElementById('modalBookingDate').value = dateStr;
    document.getElementById('bookingSlotInfo').innerHTML = `
        <i data-lucide="calendar" style="width:16px;height:16px;vertical-align:middle;"></i>
        الموعد: ${dayName} ${displayDate}<br>
        <i data-lucide="clock" style="width:16px;height:16px;vertical-align:middle;"></i>
        الوقت: ${startF} إلى ${endF}
    `;
    document.getElementById('bookingModal').style.display = 'flex';
    lucide.createIcons();
}

window.closeBookingModal = function () {
    document.getElementById('bookingModal').style.display = 'none';
    document.getElementById('bookingForm').reset();
    document.getElementById('bookingError').textContent = '';
};

async function handleBookingSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('confirmBookingBtn');
    const errorDiv = document.getElementById('bookingError');
    const slotId = document.getElementById('modalSlotId').value || null;
    const bookingDate = document.getElementById('modalBookingDate').value;
    const name = document.getElementById('customerName').value.trim();
    const phone = document.getElementById('customerPhone').value.trim();

    if (phone.length < 10) { errorDiv.textContent = "يرجى إدخال رقم موبايل صحيح."; return; }

    errorDiv.textContent = '';
    btn.disabled = true;
    btn.innerHTML = 'جاري تأكيد الحجز...';

    try {
        const urlParams = new URLSearchParams(window.location.search);
        const pitchId = urlParams.get('id');

        const startTime = window._pickerBookingData ? window._pickerBookingData.startTime : null;
        const endTime = window._pickerBookingData ? window._pickerBookingData.endTime : null;

        if (!pitchId) throw new Error("معرف الملعب غير موجود.");

        // Check availability on server side via get bookings check
        const { data: existing } = await supabaseClient
            .from('bookings')
            .select('id, status, created_at, start_time, end_time, slot_id')
            .eq('pitch_id', pitchId)
            .eq('booking_date', bookingDate);

        const startMins = timeStrToMins(startTime);
        let endMins = timeStrToMins(endTime);
        if (endMins <= startMins) endMins += 24 * 60;
        const now = new Date();

        const isOverlapping = (existing || []).some(b => {
            if (b.status === 'rejected' || b.status === 'cancelled') return false;
            if (b.status === 'pending_payment' && (now - new Date(b.created_at)) / 60000 > 10) return false;

            let bs = 0, be = 0;
            if (b.start_time && b.end_time) {
                bs = timeStrToMins(b.start_time);
                be = timeStrToMins(b.end_time);
                if (be <= bs) be += 24 * 60;
            } else if (b.slot_id) {
                const slot = _allSlots.find(s => s.id === b.slot_id);
                if (!slot) return false;
                bs = timeStrToMins(slot.start_time);
                be = timeStrToMins(slot.end_time);
                if (be <= bs) be += 24 * 60;
            } else {
                return false;
            }

            return bs < endMins && be > startMins;
        });

        if (isOverlapping) {
            throw new Error("عذراً، لقد قام شخص آخر بحجز هذا الموعد للتو. يرجى اختيار موعد آخر.");
        }

        const { data: newBooking, error: insertErr } = await supabaseClient
            .from('bookings')
            .insert([{ 
                pitch_id: pitchId, 
                slot_id: slotId, 
                booking_date: bookingDate, 
                start_time: startTime, 
                end_time: endTime, 
                customer_name: name, 
                customer_phone: phone, 
                status: 'pending_payment', 
                source: 'online' 
            }])
            .select()
            .single();

        if (insertErr) throw insertErr;

        // Save to localStorage so they can resume screenshot upload
        const pitchName = document.getElementById('pitchNameTitle').textContent;
        const expiresAt = new Date(Date.now() + 10 * 60000).toISOString();
        localStorage.setItem('pending_booking', JSON.stringify({
            id: newBooking.id,
            pitchName: pitchName,
            expiresAt: expiresAt
        }));

        window.location.href = `pay-booking.html?id=${newBooking.id}`;

    } catch (error) {
        errorDiv.textContent = error.message;
        btn.disabled = false;
        btn.innerHTML = 'تأكيد مبدئي والانتقال للدفع';
    }
}

function buildDaysTabs() {
    const tabsContainer = document.getElementById('daysTabsContainer');
    tabsContainer.innerHTML = '';
    
    let firstAvailableDay = null;

    _next7Days.forEach(dayInfo => {
        const hasSlots = _allSlots.some(s => s.day_of_week === dayInfo.dayOfWeek);
        if (!hasSlots) return;
        
        if (!firstAvailableDay) firstAvailableDay = dayInfo.dateStr;

        const isToday = dayInfo.dateStr === _next7Days[0].dateStr;
        const label = isToday ? 'النهارده' : daysMap[dayInfo.dayOfWeek];
        const displayDate = dayInfo.dateObj.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
        
        const tab = document.createElement('div');
        tab.className = 'day-tab';
        tab.dataset.date = dayInfo.dateStr;
        tab.innerHTML = `
            <div class="day-name">${label}</div>
            <div class="day-date">${displayDate}</div>
        `;
        
        tab.addEventListener('click', () => {
            document.querySelectorAll('.day-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderSlotsForDay(dayInfo.dateStr);
        });
        
        tabsContainer.appendChild(tab);
    });
    
    if (firstAvailableDay) {
        document.querySelector(`.day-tab[data-date="${firstAvailableDay}"]`).classList.add('active');
        renderSlotsForDay(firstAvailableDay);
    } else {
        document.getElementById('daysTabsContainer').style.display = 'none';
        document.getElementById('slotsContainer').innerHTML = '';
        document.getElementById('noSlotsMsg').style.display = 'block';
    }
}

function renderSlotsForDay(dateStr) {
    currentActiveDateStr = dateStr;
    const slotsContainer = document.getElementById('slotsContainer');
    slotsContainer.innerHTML = '';
    
    const durationContainer = document.getElementById('durationContainer');
    if (durationContainer) durationContainer.style.display = 'block';
    
    const dayInfo = _next7Days.find(d => d.dateStr === dateStr);
    if (!dayInfo) return;
    
    const dayWorkingHours = _allSlots.filter(s => s.day_of_week === dayInfo.dayOfWeek);
    
    const now = new Date();
    let hasAvailableSlots = false;
    
    dayWorkingHours.forEach(workingBlock => {
        let blockStartMins = timeStrToMins(workingBlock.start_time);
        let blockEndMins = timeStrToMins(workingBlock.end_time);
        if (blockEndMins <= blockStartMins) blockEndMins += 24 * 60; // Overnight
        
        // Generate possible start times in 30-min increments
        for (let m = blockStartMins; m + currentSelectedDuration <= blockEndMins; m += 30) {
            
            if (dayInfo.dateStr === _next7Days[0].dateStr) {
                const nowMins = now.getHours() * 60 + now.getMinutes();
                if (m <= nowMins) continue;
            }

            const reqStart = m;
            const reqEnd = m + currentSelectedDuration;

            const isOverlapping = _allBookings.some(b => {
                if (b.booking_date !== dayInfo.dateStr) return false;
                if (b.status === 'rejected' || b.status === 'cancelled') return false;
                if (b.status === 'pending_payment' && (now - new Date(b.created_at)) / 60000 > 10) return false;

                let bs = 0, be = 0;
                if (b.start_time && b.end_time) {
                    bs = timeStrToMins(b.start_time);
                    be = timeStrToMins(b.end_time);
                    if (be <= bs) be += 24 * 60;
                } else if (b.slot_id) {
                    const s = _allSlots.find(slotItem => slotItem.id === b.slot_id);
                    if (!s) return false;
                    bs = timeStrToMins(s.start_time);
                    be = timeStrToMins(s.end_time);
                    if (be <= bs) be += 24 * 60;
                } else {
                    return false;
                }
                
                return bs < reqEnd && be > reqStart;
            });

            if (!isOverlapping) {
                hasAvailableSlots = true;
                
                const startStr = minsToTimeStr(reqStart);
                const endStr = minsToTimeStr(reqEnd);
                
                const startF = formatArabicTime(startStr);
                const endF = formatArabicTime(endStr);
                
                const displayDate = dayInfo.dateObj.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
                const dayName = daysMap[dayInfo.dayOfWeek];
                
                const price = Math.round((currentSelectedDuration / 60) * (window._pitchPrice || 0));

                const el = document.createElement('div');
                el.className = 'slot-card animate-fade-in';

                el.innerHTML = `
                    <div class="slot-time" style="justify-content:center; font-size:1.1rem; margin-top:5px; color: var(--primary-color);">
                        ${startF} - ${endF}
                    </div>
                    <div style="font-size:0.85rem; color:var(--text-muted); text-align:center; margin-top:5px;">
                        المدة: ${currentSelectedDuration / 60} ساعة | السعر: ${price} جنيه
                    </div>
                    <button class="btn btn-primary btn-full" style="margin-top:15px; font-size:1rem; padding:10px;"
                        onclick="openBookingModal('${workingBlock.id}','${dayInfo.dateStr}','${dayName}','${displayDate}','${startF}','${endF}','${startStr}','${endStr}', ${price})">
                        احجز الموعد
                    </button>
                    <button class="btn btn-full" style="margin-top:8px; font-size:0.85rem; padding:8px; background:rgba(139,92,246,0.15); border:1px solid #8b5cf6; color:#8b5cf6; border-radius:8px; cursor:pointer;"
                        onclick="openRecurringModal('${workingBlock.id}','${dayName}','${startF}','${endF}', ${price}, '${startStr}', '${endStr}')">
                        🔁 حجز أسبوعي ثابت
                    </button>
                `;
                slotsContainer.appendChild(el);
            }
        }
    });
    
    if (!hasAvailableSlots) {
        slotsContainer.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-color);">
                <i data-lucide="calendar-x" style="width:48px;height:48px;color:var(--text-muted);margin-bottom:15px;"></i>
                <p style="color:var(--text-muted); font-size:1.1rem;">مفيش مواعيد فاضية لـ المدة اللي اخترتها، جرب تغير المدة أو اختار يوم تاني.</p>
            </div>
        `;
    }
    
    lucide.createIcons();
}

// ==========================================
// RECURRING BOOKING
// ==========================================
function openRecurringModal(slotId, dayName, startF, endF, pitchPrice, rawStart, rawEnd) {
    window._pickerRecurringData = { startTime: rawStart, endTime: rawEnd };
    document.getElementById('recurringSlotId').value = slotId;
    document.getElementById('recurringSlotInfo').textContent = `كل ${dayName} — ${startF} إلى ${endF}`;
    const deposit = Math.round(Number(pitchPrice) * 0.5);
    document.getElementById('recurringDepositAmount').textContent = deposit;
    document.getElementById('recurringModal').style.display = 'flex';
}

window.openRecurringModal = openRecurringModal;

window.closeRecurringModal = function () {
    document.getElementById('recurringModal').style.display = 'none';
    document.getElementById('recurringForm').reset();
    document.getElementById('recurringError').textContent = '';
};

async function handleRecurringSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('confirmRecurringBtn');
    const errorDiv = document.getElementById('recurringError');
    const slotId = document.getElementById('recurringSlotId').value;
    const name = document.getElementById('recurringName').value.trim();
    const phone = document.getElementById('recurringPhone').value.trim();
    const depositAmount = parseFloat(document.getElementById('recurringDepositAmount').textContent) || 0;

    if (phone.length < 10) { errorDiv.textContent = "يرجى إدخال رقم موبايل صحيح."; return; }

    errorDiv.textContent = '';
    btn.disabled = true;
    btn.innerHTML = 'جاري التسجيل...';

    try {
        const { data: slot, error: slotErr } = await supabaseClient.from('slots').select('pitch_id').eq('id', slotId).single();
        if (slotErr) throw slotErr;

        const { data: existingRecurring } = await supabaseClient
            .from('recurring_bookings').select('id').eq('slot_id', slotId).eq('status', 'active');

        if (existingRecurring && existingRecurring.length > 0) {
            throw new Error("هذا الموعد محجوز أسبوعياً بالفعل من عميل آخر. يرجى اختيار موعد مختلف.");
        }

        const { data: newRecurring, error: insertErr } = await supabaseClient
            .from('recurring_bookings')
            .insert([{ customer_phone: phone, customer_name: name, pitch_id: slot.pitch_id, slot_id: slotId, deposit_amount: depositAmount, status: 'active' }])
            .select().single();

        if (insertErr) throw insertErr;
        window.location.href = `pay-deposit.html?id=${newRecurring.id}`;

    } catch (error) {
        errorDiv.textContent = error.message;
        btn.disabled = false;
        btn.innerHTML = 'متابعة لدفع العربون';
    }
}

// ==========================================
// HELPERS
// ==========================================
function timeStrToMins(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function minsToTimeStr(mins) {
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

function formatArabicTime(timeStr) {
    if (window.formatEgyptianTime) return window.formatEgyptianTime(timeStr);
    const [h, m] = timeStr.split(':');
    const d = new Date();
    d.setHours(h, m);
    return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}
