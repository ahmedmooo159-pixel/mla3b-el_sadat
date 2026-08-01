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

    // Day picker change - reset start/end and rebuild start options
    document.getElementById('pickerDay').addEventListener('change', () => {
        const dateStr = document.getElementById('pickerDay').value;
        document.getElementById('pickerStart').innerHTML = '<option value="">-- بداية --</option>';
        document.getElementById('pickerEnd').innerHTML = '<option value="">-- نهاية --</option>';
        document.getElementById('availabilityResult').style.display = 'none';
        if (dateStr) buildStartPicker(dateStr);
    });

    // Start picker change - build end options then check availability
    document.getElementById('pickerStart').addEventListener('change', () => {
        document.getElementById('pickerEnd').innerHTML = '<option value="">-- نهاية --</option>';
        document.getElementById('availabilityResult').style.display = 'none';
        buildEndPicker();
    });
    
    // End picker change handled via onchange="checkAvailability()" in HTML
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
    const startSel = document.getElementById('pickerStart');
    startSel.innerHTML = '<option value="">-- بداية --</option>';

    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const isToday = dateStr === _next7Days[0].dateStr;

    for (let mins = 0; mins < 24 * 60; mins += 30) {
        if (isToday && mins <= nowMins) continue;
        const timeStr = minsToTimeStr(mins);
        const opt = document.createElement('option');
        opt.value = timeStr;
        opt.textContent = formatArabicTime(timeStr);
        startSel.appendChild(opt);
    }
}

// ==========================================
// END TIME PICKER
// ==========================================
function buildEndPicker() {
    const startTime = document.getElementById('pickerStart').value;
    const endSel = document.getElementById('pickerEnd');
    endSel.innerHTML = '<option value="">-- نهاية --</option>';

    if (!startTime) return;

    const startMins = timeStrToMins(startTime);
    for (let mins = startMins + 30; mins <= 24 * 60; mins += 30) {
        const timeStr = minsToTimeStr(mins);
        const opt = document.createElement('option');
        opt.value = timeStr;
        opt.textContent = formatArabicTime(timeStr);
        endSel.appendChild(opt);
    }
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

    const daySlots = _allSlots.filter(s => s.day_of_week === dayInfo.dayOfWeek);
    resultDiv.style.display = 'block';

    if (daySlots.length === 0) {
        resultDiv.innerHTML = `
            <div style="background:rgba(239,68,68,0.1); border:1px solid #ef4444; border-radius:12px; padding:15px;">
                <p style="color:#ef4444; font-weight:bold;">❌ الملعب مغلق في هذا اليوم</p>
            </div>`;
        return;
    }

    // Helper: check if a 30-min block is inside working hours
    function isInsideWorkingHours(mins) {
        return daySlots.some(s => {
            const ss = timeStrToMins(s.start_time);
            const se = timeStrToMins(s.end_time);
            return ss <= mins && (mins + 30) <= se;
        });
    }

    // Helper: check if a 30-min block is booked
    const now = new Date();
    function isBlockBooked(mins) {
        return _allBookings.some(b => {
            if (b.booking_date !== dateStr) return false;
            if (b.status === 'rejected' || b.status === 'cancelled') return false;
            if (b.status === 'pending_payment' && (now - new Date(b.created_at)) / 60000 > 10) return false;
            
            let bs = 0, be = 0;
            if (b.start_time && b.end_time) {
                bs = timeStrToMins(b.start_time);
                be = timeStrToMins(b.end_time);
            } else if (b.slot_id) {
                const slot = _allSlots.find(s => s.id === b.slot_id);
                if (!slot) return false;
                bs = timeStrToMins(slot.start_time);
                be = timeStrToMins(slot.end_time);
            } else {
                return false;
            }
            return bs <= mins && (mins + 30) <= be;
        });
    }

    // Check if the requested range is inside working hours
    let outOfHours = false;
    for (let m = startMins; m < endMins; m += 30) {
        if (!isInsideWorkingHours(m)) {
            outOfHours = true;
            break;
        }
    }

    if (outOfHours) {
        const workingHoursStr = daySlots.map(s => `${formatArabicTime(s.start_time)} - ${formatArabicTime(s.end_time)}`).join('، ');
        resultDiv.innerHTML = `
            <div style="background:rgba(239,68,68,0.1); border:1px solid #ef4444; border-radius:12px; padding:15px;">
                <p style="color:#ef4444; font-weight:bold;">❌ هذا الوقت خارج ساعات عمل الملعب</p>
                <p style="color:var(--text-muted); font-size:0.9rem; margin-top:5px;">ساعات العمل المتاحة: ${workingHoursStr}</p>
            </div>`;
        return;
    }

    // Check conflicts
    const conflicts = [];
    for (let m = startMins; m < endMins; m += 30) {
        if (isBlockBooked(m)) {
            conflicts.push(m);
        }
    }

    if (conflicts.length === 0) {
        // ✅ Fully available
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
                    onclick="openBookingModalFromPicker('${dateStr}','${startTime}','${endTime}','${daysMap[dayInfo.dayOfWeek]}')">
                    🚀 احجز دلوقتي
                </button>
            </div>`;
    } else {
        // ⚠️ Conflict — find the max booking end time that overlaps with the request
        let maxConflictEnd = 0;
        _allBookings.forEach(b => {
            if (b.booking_date !== dateStr) return;
            if (b.status === 'rejected' || b.status === 'cancelled') return;
            if (b.status === 'pending_payment' && (now - new Date(b.created_at)) / 60000 > 10) return;
            
            let bs = 0, be = 0;
            if (b.start_time && b.end_time) {
                bs = timeStrToMins(b.start_time);
                be = timeStrToMins(b.end_time);
            } else if (b.slot_id) {
                const slot = _allSlots.find(s => s.id === b.slot_id);
                if (slot) {
                    bs = timeStrToMins(slot.start_time);
                    be = timeStrToMins(slot.end_time);
                }
            }
            
            if (bs < endMins && be > startMins) {
                if (be > maxConflictEnd) maxConflictEnd = be;
            }
        });

        const maxConflictEndStr = minsToTimeStr(maxConflictEnd);

        // Calculate all free blocks for this day to show alternatives
        const freeIntervals = [];
        let currentFreeStart = null;
        for (let m = 0; m < 24 * 60; m += 30) {
            if (isInsideWorkingHours(m) && !isBlockBooked(m)) {
                if (currentFreeStart === null) currentFreeStart = m;
            } else {
                if (currentFreeStart !== null) {
                    freeIntervals.push({ start: currentFreeStart, end: m });
                    currentFreeStart = null;
                }
            }
        }
        if (currentFreeStart !== null) {
            freeIntervals.push({ start: currentFreeStart, end: 24 * 60 });
        }

        const freeTimesStr = freeIntervals.map(interval => 
            `${formatArabicTime(minsToTimeStr(interval.start))} – ${formatArabicTime(minsToTimeStr(interval.end))}`
        ).join('، ');

        resultDiv.innerHTML = `
            <div style="background:rgba(245,158,11,0.1); border:1px solid #f59e0b; border-radius:12px; padding:20px;">
                <p style="color:#f59e0b; font-weight:bold; font-size:1rem; margin-bottom:8px;">⚠️ الوقت ده محجوز جزئياً أو كلياً!</p>
                <p style="color:var(--text-muted); font-size:0.9rem;">
                    الحجز الموجود هيخلص الساعة <strong style="color:#f59e0b;">${formatArabicTime(maxConflictEndStr)}</strong>
                </p>
                <div style="margin-top:12px; padding-top:12px; border-top:1px solid rgba(245,158,11,0.3);">
                    <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:6px;">📅 الفترات الفاضية المتاحة في هذا اليوم:</p>
                    <p style="color:var(--primary-color); font-weight:bold; font-size:0.9rem;">${freeTimesStr || 'لا توجد مواعيد متاحة في هذا اليوم.'}</p>
                </div>
            </div>`;
    }

    lucide.createIcons();
};

// ==========================================
// BOOKING MODAL — from time picker
// ==========================================
window.openBookingModalFromPicker = function (dateStr, startTime, endTime, dayName) {
    window._pickerBookingData = { dateStr, startTime, endTime };
    const displayDate = new Date(dateStr + 'T00:00:00').toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
    document.getElementById('modalSlotId').value = '';
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
    window._pickerBookingData = { dateStr, startTime, endTime, slotId };
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
        const endMins = timeStrToMins(endTime);
        const now = new Date();

        const isOverlapping = (existing || []).some(b => {
            if (b.status === 'rejected' || b.status === 'cancelled') return false;
            if (b.status === 'pending_payment' && (now - new Date(b.created_at)) / 60000 > 10) return false;

            let bs = 0, be = 0;
            if (b.start_time && b.end_time) {
                bs = timeStrToMins(b.start_time);
                be = timeStrToMins(b.end_time);
            } else if (b.slot_id) {
                const slot = _allSlots.find(s => s.id === b.slot_id);
                if (!slot) return false;
                bs = timeStrToMins(slot.start_time);
                be = timeStrToMins(slot.end_time);
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
                if (b.booking_date !== dayInfo.dateStr) return false;
                if (b.status === 'rejected' || b.status === 'cancelled') return false;
                if (b.status === 'pending_payment' && (now - new Date(b.created_at)) / 60000 > 10) return false;

                let bs = 0, be = 0;
                if (b.start_time && b.end_time) {
                    bs = timeStrToMins(b.start_time);
                    be = timeStrToMins(b.end_time);
                } else if (b.slot_id) {
                    const s = _allSlots.find(slotItem => slotItem.id === b.slot_id);
                    if (!s) return false;
                    bs = timeStrToMins(s.start_time);
                    be = timeStrToMins(s.end_time);
                } else {
                    return false;
                }

                const slotStart = timeStrToMins(slot.start_time);
                const slotEnd = timeStrToMins(slot.end_time);
                return bs < slotEnd && be > slotStart;
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
