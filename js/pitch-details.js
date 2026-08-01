// js/pitch-details.js

const daysMap = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// Global state
let _allSlots = [];
let _allBookings = [];
let _next7Days = [];

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

    // Day picker change
    document.getElementById('pickerDay').addEventListener('change', () => {
        const dateStr = document.getElementById('pickerDay').value;
        document.getElementById('pickerStart').innerHTML = '<option value="">-- بداية --</option>';
        document.getElementById('pickerEnd').innerHTML = '<option value="">-- نهاية --</option>';
        document.getElementById('availabilityResult').style.display = 'none';
        if (dateStr) buildStartPicker(dateStr);
    });

    document.getElementById('pickerStart').addEventListener('change', () => {
        buildEndPicker();
        checkAvailability();
    });
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
            .select('*')
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
        .select('slot_id, booking_date, status, created_at, id')
        .in('slot_id', slotIds)
        .gte('booking_date', _next7Days[0].dateStr)
        .lte('booking_date', _next7Days[6].dateStr);

    _allBookings = bookings || [];

    buildDayPicker();
    renderAllSlotsGrid();
}

// ==========================================
// DAY PICKER
// ==========================================
function buildDayPicker() {
    const select = document.getElementById('pickerDay');
    select.innerHTML = '<option value="">اختار يوم</option>';

    _next7Days.forEach(dayInfo => {
        const hasSlots = _allSlots.some(s => s.day_of_week === dayInfo.dayOfWeek);
        if (!hasSlots) return;
        const opt = document.createElement('option');
        opt.value = dayInfo.dateStr;
        const isToday = dayInfo.dateStr === _next7Days[0].dateStr;
        const label = isToday ? 'النهارده' : daysMap[dayInfo.dayOfWeek];
        const displayDate = dayInfo.dateObj.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
        opt.textContent = `${label} (${displayDate})`;
        select.appendChild(opt);
    });
}

// ==========================================
// START TIME PICKER
// ==========================================
function buildStartPicker(dateStr) {
    const dayInfo = _next7Days.find(d => d.dateStr === dateStr);
    if (!dayInfo) return;

    const daySlots = _allSlots.filter(s => s.day_of_week === dayInfo.dayOfWeek);
    const times = new Set();

    daySlots.forEach(s => {
        const [sh, sm] = s.start_time.split(':').map(Number);
        const [eh, em] = s.end_time.split(':').map(Number);
        let cur = sh * 60 + sm;
        const end = eh * 60 + em;
        while (cur < end) {
            times.add(cur);
            cur += 30;
        }
    });

    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const isToday = dateStr === _next7Days[0].dateStr;
    const startSel = document.getElementById('pickerStart');
    startSel.innerHTML = '<option value="">-- بداية --</option>';

    Array.from(times).sort((a, b) => a - b).forEach(mins => {
        if (isToday && mins <= nowMins) return;
        const timeStr = minsToTimeStr(mins);
        const opt = document.createElement('option');
        opt.value = timeStr;
        opt.textContent = formatArabicTime(timeStr);
        startSel.appendChild(opt);
    });
}

// ==========================================
// END TIME PICKER
// ==========================================
function buildEndPicker() {
    const dateStr = document.getElementById('pickerDay').value;
    const startTime = document.getElementById('pickerStart').value;
    const endSel = document.getElementById('pickerEnd');
    endSel.innerHTML = '<option value="">-- نهاية --</option>';

    if (!dateStr || !startTime) return;

    const dayInfo = _next7Days.find(d => d.dateStr === dateStr);
    if (!dayInfo) return;

    const daySlots = _allSlots.filter(s => s.day_of_week === dayInfo.dayOfWeek);
    const startMins = timeStrToMins(startTime);

    // Find the furthest contiguous end we can reach from startMins
    let maxEnd = 0;
    daySlots.forEach(s => {
        const slotStart = timeStrToMins(s.start_time);
        const slotEnd = timeStrToMins(s.end_time);
        if (slotStart <= startMins && startMins < slotEnd) {
            maxEnd = Math.max(maxEnd, slotEnd);
        }
    });

    if (maxEnd <= startMins) return;

    const times = new Set();
    let cur = startMins + 30;
    while (cur <= maxEnd) {
        times.add(cur);
        cur += 30;
    }

    Array.from(times).sort((a, b) => a - b).forEach(mins => {
        const timeStr = minsToTimeStr(mins);
        const opt = document.createElement('option');
        opt.value = timeStr;
        opt.textContent = formatArabicTime(timeStr);
        endSel.appendChild(opt);
    });
}

// ==========================================
// AVAILABILITY CHECK
// ==========================================
window.checkAvailability = function () {
    const dateStr = document.getElementById('pickerDay').value;
    const startTime = document.getElementById('pickerStart').value;
    const endTime = document.getElementById('pickerEnd').value;
    const resultDiv = document.getElementById('availabilityResult');

    if (!dateStr || !startTime || !endTime) {
        resultDiv.style.display = 'none';
        return;
    }

    const startMins = timeStrToMins(startTime);
    const endMins = timeStrToMins(endTime);
    if (endMins <= startMins) { resultDiv.style.display = 'none'; return; }

    const dayInfo = _next7Days.find(d => d.dateStr === dateStr);
    if (!dayInfo) return;

    const now = new Date();

    // Collect overlapping slots
    const overlapping = _allSlots.filter(s => {
        if (s.day_of_week !== dayInfo.dayOfWeek) return false;
        const ss = timeStrToMins(s.start_time);
        const se = timeStrToMins(s.end_time);
        return ss < endMins && se > startMins;
    });

    resultDiv.style.display = 'block';

    if (overlapping.length === 0) {
        resultDiv.innerHTML = `
            <div style="background:rgba(239,68,68,0.1); border:1px solid #ef4444; border-radius:12px; padding:15px;">
                <p style="color:#ef4444; font-weight:bold;">❌ هذا الوقت خارج ساعات عمل الملعب</p>
                <p style="color:var(--text-muted); font-size:0.9rem; margin-top:5px;">اختار وقتاً من الأوقات المتاحة في القوائم أعلاه</p>
            </div>`;
        return;
    }

    // Check each 30-min chunk for conflicts
    const conflicts = [];
    let checkMins = startMins;
    while (checkMins < endMins) {
        const coverSlot = overlapping.find(s => {
            const ss = timeStrToMins(s.start_time);
            const se = timeStrToMins(s.end_time);
            return ss <= checkMins && checkMins < se;
        });

        if (coverSlot) {
            const isBooked = _allBookings.some(b => {
                if (b.slot_id !== coverSlot.id || b.booking_date !== dateStr) return false;
                if (b.status === 'confirmed') return true;
                if (b.status === 'pending_payment') {
                    return (now - new Date(b.created_at)) / 60000 <= 10;
                }
                return false;
            });

            if (isBooked) {
                const slotEnd = timeStrToMins(coverSlot.end_time);
                conflicts.push(slotEnd);
                checkMins = slotEnd;
                continue;
            }
        }
        checkMins += 30;
    }

    if (conflicts.length === 0) {
        // ✅ Fully available
        const slotIds = overlapping.map(s => s.id);
        const hours = ((endMins - startMins) / 60).toFixed(1).replace('.0', '');
        const price = Math.round((endMins - startMins) / 60 * (window._pitchPrice || 0));

        resultDiv.innerHTML = `
            <div style="background:rgba(34,197,94,0.1); border:1px solid var(--primary-color); border-radius:12px; padding:20px;">
                <p style="color:var(--primary-color); font-weight:bold; font-size:1.1rem; margin-bottom:10px;">✅ الوقت ده متاح تماماً!</p>
                <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:5px;">
                    <strong>${daysMap[dayInfo.dayOfWeek]}</strong> — ${formatArabicTime(startTime)} إلى ${formatArabicTime(endTime)}
                    &nbsp;|&nbsp; <strong>${hours} ساعة</strong>
                    ${price > 0 ? `&nbsp;|&nbsp; السعر: <strong style="color:var(--primary-color);">${price} جنيه</strong>` : ''}
                </p>
                <button class="btn btn-primary" style="width:100%; margin-top:15px; padding:12px;"
                    onclick="openBookingModalFromPicker('${dateStr}','${startTime}','${endTime}','${daysMap[dayInfo.dayOfWeek]}',${JSON.stringify(slotIds)})">
                    🚀 احجز دلوقتي
                </button>
            </div>`;
    } else {
        // ⚠️ Conflict — show when it ends + alternatives
        const maxConflictEnd = Math.max(...conflicts);
        const maxConflictEndStr = minsToTimeStr(maxConflictEnd);

        const daySlots = _allSlots.filter(s => s.day_of_week === dayInfo.dayOfWeek);
        const availableAfter = [];
        daySlots.forEach(slot => {
            const ss = timeStrToMins(slot.start_time);
            const se = timeStrToMins(slot.end_time);
            if (ss >= maxConflictEnd) {
                const booked = _allBookings.some(b => {
                    if (b.slot_id !== slot.id || b.booking_date !== dateStr) return false;
                    if (b.status === 'confirmed') return true;
                    if (b.status === 'pending_payment') return (now - new Date(b.created_at)) / 60000 <= 10;
                    return false;
                });
                if (!booked) availableAfter.push(`${formatArabicTime(slot.start_time)} – ${formatArabicTime(slot.end_time)}`);
            }
        });

        const altHTML = availableAfter.length > 0
            ? `<div style="margin-top:12px; padding-top:12px; border-top:1px solid rgba(245,158,11,0.3);">
                <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:6px;">📅 المواعيد المتاحة بعده في نفس اليوم:</p>
                <div style="display:flex; flex-wrap:wrap; gap:8px;">
                    ${availableAfter.map(t => `<span style="background:rgba(34,197,94,0.15); color:var(--primary-color); padding:4px 10px; border-radius:8px; font-size:0.85rem;">${t}</span>`).join('')}
                </div>
               </div>`
            : `<p style="margin-top:10px; font-size:0.85rem; color:var(--text-muted);">لا توجد مواعيد أخرى متاحة في هذا اليوم.</p>`;

        resultDiv.innerHTML = `
            <div style="background:rgba(245,158,11,0.1); border:1px solid #f59e0b; border-radius:12px; padding:20px;">
                <p style="color:#f59e0b; font-weight:bold; font-size:1rem; margin-bottom:8px;">⚠️ الوقت ده محجوز جزئياً أو كلياً!</p>
                <p style="color:var(--text-muted); font-size:0.9rem;">
                    الحجز الموجود هيخلص الساعة <strong style="color:#f59e0b;">${formatArabicTime(maxConflictEndStr)}</strong>
                </p>
                ${altHTML}
            </div>`;
    }

    lucide.createIcons();
};

// ==========================================
// BOOKING MODAL — from time picker
// ==========================================
window.openBookingModalFromPicker = function (dateStr, startTime, endTime, dayName, slotIds) {
    window._pickerBookingData = { dateStr, startTime, endTime, slotIds };
    const displayDate = new Date(dateStr + 'T00:00:00').toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
    document.getElementById('modalSlotId').value = slotIds[0];
    document.getElementById('modalBookingDate').value = dateStr;
    document.getElementById('bookingSlotInfo').innerHTML = `
        <i data-lucide="calendar" style="width:16px;height:16px;vertical-align:middle;"></i>
        الموعد: ${dayName} ${displayDate}<br>
        <i data-lucide="clock" style="width:16px;height:16px;vertical-align:middle;"></i>
        الوقت: ${formatArabicTime(startTime)} إلى ${formatArabicTime(endTime)}
    `;
    document.getElementById('bookingModal').style.display = 'flex';
    lucide.createIcons();
};

// BOOKING MODAL — from slots grid
function openBookingModal(slotId, dateStr, dayName, displayDate, startTime, endTime) {
    window._pickerBookingData = null;
    document.getElementById('modalSlotId').value = slotId;
    document.getElementById('modalBookingDate').value = dateStr;
    document.getElementById('bookingSlotInfo').innerHTML = `
        <i data-lucide="calendar" style="width:16px;height:16px;vertical-align:middle;"></i>
        الموعد: ${dayName} ${displayDate}<br>
        <i data-lucide="clock" style="width:16px;height:16px;vertical-align:middle;"></i>
        الوقت: ${startTime} إلى ${endTime}
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
    const slotId = document.getElementById('modalSlotId').value;
    const bookingDate = document.getElementById('modalBookingDate').value;
    const name = document.getElementById('customerName').value.trim();
    const phone = document.getElementById('customerPhone').value.trim();

    if (phone.length < 10) { errorDiv.textContent = "يرجى إدخال رقم موبايل صحيح."; return; }

    errorDiv.textContent = '';
    btn.disabled = true;
    btn.innerHTML = 'جاري تأكيد الحجز...';

    try {
        const { data: existing } = await supabaseClient
            .from('bookings')
            .select('id, status, created_at')
            .eq('slot_id', slotId)
            .eq('booking_date', bookingDate);

        if (existing && existing.length > 0) {
            const now = new Date();
            const blocked = existing.some(b => {
                if (b.status === 'confirmed') return true;
                if (b.status === 'pending_payment') return (now - new Date(b.created_at)) / 60000 <= 10;
                return false;
            });
            if (blocked) throw new Error("عذراً، لقد قام شخص آخر بحجز هذا الموعد للتو. يرجى اختيار موعد آخر.");
        }

        const { data: newBooking, error: insertErr } = await supabaseClient
            .from('bookings')
            .insert([{ slot_id: slotId, booking_date: bookingDate, customer_name: name, customer_phone: phone, status: 'pending_payment', source: 'online' }])
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

// ==========================================
// ALL SLOTS GRID (collapsible)
// ==========================================
function renderAllSlotsGrid() {
    const slotsContainer = document.getElementById('slotsContainer');
    if (!_allSlots || _allSlots.length === 0) return;

    const now = new Date();
    const cards = [];

    _next7Days.forEach(dayInfo => {
        const daySlots = _allSlots.filter(s => s.day_of_week === dayInfo.dayOfWeek);
        daySlots.sort((a, b) => a.start_time.localeCompare(b.start_time));

        daySlots.forEach(slot => {
            if (dayInfo.dateStr === _next7Days[0].dateStr) {
                const slotTime = new Date();
                const [h, m] = slot.start_time.split(':');
                slotTime.setHours(h, m, 0);
                if (slotTime < now) return;
            }

            const isBooked = _allBookings.some(b => {
                if (b.slot_id !== slot.id || b.booking_date !== dayInfo.dateStr) return false;
                if (b.status === 'confirmed') return true;
                if (b.status === 'pending_payment') return (now - new Date(b.created_at)) / 60000 <= 10;
                return false;
            });

            if (!isBooked) cards.push({ slot, dateInfo: dayInfo });
        });
    });

    if (cards.length === 0) {
        slotsContainer.innerHTML = '<p style="color:var(--text-muted); padding:20px 0;">كل المواعيد محجوزة للأسبوع القادم.</p>';
        return;
    }

    slotsContainer.innerHTML = '';
    cards.forEach(item => {
        const el = document.createElement('div');
        el.className = 'slot-card';
        const displayDate = item.dateInfo.dateObj.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
        const dayName = daysMap[item.dateInfo.dayOfWeek];
        const startF = formatArabicTime(item.slot.start_time);
        const endF = formatArabicTime(item.slot.end_time);

        el.innerHTML = `
            <div class="slot-day" style="font-size:1rem;">${dayName} ${displayDate}</div>
            <div class="slot-time" style="justify-content:center; font-size:0.95rem; margin-top:5px;">${startF} - ${endF}</div>
            <button class="btn btn-outline btn-full" style="margin-top:15px; font-size:0.9rem; padding:8px;"
                onclick="openBookingModal('${item.slot.id}','${item.dateInfo.dateStr}','${dayName}','${displayDate}','${startF}','${endF}')">
                احجز هذا الموعد
            </button>
            <button class="btn btn-full" style="margin-top:8px; font-size:0.85rem; padding:7px; background:rgba(139,92,246,0.15); border:1px solid #8b5cf6; color:#8b5cf6; border-radius:8px; cursor:pointer;"
                onclick="openRecurringModal('${item.slot.id}','${dayName}','${startF}','${endF}',window._pitchPrice||0)">
                🔁 حجز أسبوعي ثابت
            </button>
        `;
        slotsContainer.appendChild(el);
    });

    lucide.createIcons();
}

// ==========================================
// RECURRING BOOKING
// ==========================================
function openRecurringModal(slotId, dayName, startTime, endTime, pitchPrice) {
    document.getElementById('recurringSlotId').value = slotId;
    document.getElementById('recurringSlotInfo').textContent = `كل ${dayName} — ${startTime} إلى ${endTime}`;
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
    const [h, m] = timeStr.split(':');
    const d = new Date();
    d.setHours(h, m);
    return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}
