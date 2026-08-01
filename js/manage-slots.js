// js/manage-slots.js

const daysMap = {
    0: 'الأحد', 1: 'الإثنين', 2: 'الثلاثاء',
    3: 'الأربعاء', 4: 'الخميس', 5: 'الجمعة', 6: 'السبت'
};

let currentPitchId = null;

document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();
    
    const urlParams = new URLSearchParams(window.location.search);
    currentPitchId = urlParams.get('id');
    
    if (!currentPitchId) {
        alert("معرف الملعب غير موجود");
        window.location.href = 'dashboard.html';
        return;
    }
    
    document.getElementById('pitchId').value = currentPitchId;
    document.getElementById('pitchIdBulk').value = currentPitchId;
    
    setTimeout(async () => {
        if (!currentUser) {
            window.location.href = 'login.html';
            return;
        }
        await verifyOwnershipAndLoad(currentPitchId);
        document.getElementById('addSlotForm').addEventListener('submit', handleAddSlot);
    }, 500);
    
    // Manual booking form
    const manualForm = document.getElementById('manualBookingForm');
    if (manualForm) {
        manualForm.addEventListener('submit', handleManualBooking);
    }
});

async function verifyOwnershipAndLoad(pitchId) {
    try {
        const { data: pitch, error } = await supabaseClient
            .from('pitches')
            .select('*')
            .eq('id', pitchId)
            .eq('owner_id', currentUser.id)
            .single();
            
        if (error || !pitch) {
            alert("لا تملك صلاحية إدارة هذا الملعب.");
            window.location.href = 'dashboard.html';
            return;
        }
        
        document.getElementById('pitchNameTitle').textContent = `إدارة مواعيد: ${pitch.name}`;
        await loadSlots(pitchId);
        
    } catch (err) {
        console.error(err);
    }
}

async function loadSlots(pitchId) {
    const listDiv = document.getElementById('slotsList');
    const loading = document.getElementById('loadingIndicator');
    const noSlots = document.getElementById('noSlots');
    
    loading.style.display = 'block';
    listDiv.style.display = 'none';
    noSlots.style.display = 'none';
    
    try {
        const { data: slots, error } = await supabaseClient
            .from('slots')
            .select('*')
            .eq('pitch_id', pitchId)
            .order('day_of_week')
            .order('start_time');
            
        if (error) throw error;
        
        if (!slots || slots.length === 0) {
            loading.style.display = 'none';
            noSlots.style.display = 'block';
            return;
        }
        
        // For each slot, check if it has manual booking for today/this week
        await renderSlots(slots);
        loading.style.display = 'none';
        
    } catch (error) {
        console.error("Error loading slots:", error);
        loading.textContent = "حدث خطأ أثناء تحميل المواعيد.";
    }
}

function formatTimeDisplay(timeStr) {
    const [h, m] = timeStr.split(':');
    const d = new Date();
    d.setHours(h, m);
    return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

// Get next occurrence date for a given day of week
function getNextDateForDay(dayOfWeek) {
    const today = new Date();
    today.setHours(0,0,0,0);
    const diff = (dayOfWeek - today.getDay() + 7) % 7;
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + diff);
    const y = nextDate.getFullYear();
    const m = String(nextDate.getMonth() + 1).padStart(2, '0');
    const day = String(nextDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

async function renderSlots(slots) {
    const listDiv = document.getElementById('slotsList');
    listDiv.innerHTML = '';
    
    // Fetch manual bookings for all slots (upcoming)
    const slotIds = slots.map(s => s.id);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    const { data: manualBookings } = await supabaseClient
        .from('bookings')
        .select('slot_id, booking_date, id, notes, status')
        .in('slot_id', slotIds)
        .eq('source', 'manual')
        .in('status', ['confirmed'])
        .gte('booking_date', todayStr);
    
    const manualMap = {};
    (manualBookings || []).forEach(b => {
        const key = `${b.slot_id}_${b.booking_date}`;
        manualMap[key] = b;
    });
    
    slots.forEach(slot => {
        const nextDate = getNextDateForDay(slot.day_of_week);
        const key = `${slot.id}_${nextDate}`;
        const manualBooking = manualMap[key];
        const isManualBooked = !!manualBooking;
        
        const el = document.createElement('div');
        el.className = `slot-card${isManualBooked ? ' manual-booked' : ''}`;
        
        const statusBadge = isManualBooked
            ? `<span class="status-badge" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b;">محجوز يدوياً</span>`
            : `<span class="status-badge">متاح</span>`;
        
        const actionBtn = isManualBooked
            ? `<button class="release-btn" onclick="releaseManualBooking('${manualBooking.id}', '${slot.id}')">
                 🔓 فك القفل وإتاحة الموعد
               </button>`
            : `<button class="manual-book-btn" onclick="openManualModal('${slot.id}', '${nextDate}', '${daysMap[slot.day_of_week]}', '${formatTimeDisplay(slot.start_time)}', '${formatTimeDisplay(slot.end_time)}')">
                 📋 حجز يدوي (كاش/تليفون)
               </button>`;
        
        el.innerHTML = `
            <div class="slot-day">${daysMap[slot.day_of_week]}</div>
            <div class="slot-time" style="justify-content: center; font-size: 0.9rem; margin-top: 5px;">
                <i data-lucide="clock" style="width: 14px; height: 14px;"></i>
                ${formatTimeDisplay(slot.start_time)} - ${formatTimeDisplay(slot.end_time)}
            </div>
            <div style="margin-top: 8px;">${statusBadge}</div>
            ${isManualBooked && manualBooking.notes ? `<p style="font-size:0.8rem; color:var(--text-muted); margin-top:5px;">${manualBooking.notes}</p>` : ''}
            ${actionBtn}
            <button class="delete-btn" onclick="deleteSlot('${slot.id}')" title="حذف الموعد">
                <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
            </button>
        `;
        listDiv.appendChild(el);
    });
    
    listDiv.style.display = 'grid';
    lucide.createIcons();
}

// Manual Booking Modal
window.openManualModal = function(slotId, dateStr, dayName, startTime, endTime) {
    document.getElementById('manualSlotId').value = slotId;
    document.getElementById('manualBookingDate').value = dateStr;
    document.getElementById('manualSlotInfo').textContent = `${dayName} — ${startTime} إلى ${endTime} (${dateStr})`;
    document.getElementById('manualBookingModal').style.display = 'flex';
};

window.closeManualModal = function() {
    document.getElementById('manualBookingModal').style.display = 'none';
    document.getElementById('manualBookingForm').reset();
    document.getElementById('manualError').textContent = '';
};

async function handleManualBooking(e) {
    e.preventDefault();
    const btn = document.getElementById('confirmManualBtn');
    const errorDiv = document.getElementById('manualError');
    const slotId = document.getElementById('manualSlotId').value;
    const bookingDate = document.getElementById('manualBookingDate').value;
    const notes = document.getElementById('manualNotes').value.trim();
    
    errorDiv.textContent = '';
    btn.disabled = true;
    btn.textContent = 'جاري التثبيت...';
    
    try {
        const { error } = await supabaseClient
            .from('bookings')
            .insert([{
                slot_id: slotId,
                booking_date: bookingDate,
                customer_name: notes || 'حجز يدوي',
                customer_phone: '00000000000',
                status: 'confirmed',
                source: 'manual',
                notes: notes
            }]);
            
        if (error) throw error;
        
        window.closeManualModal();
        await loadSlots(currentPitchId);
        
    } catch (err) {
        errorDiv.textContent = 'حدث خطأ: ' + err.message;
        btn.disabled = false;
        btn.textContent = 'تثبيت الحجز اليدوي';
    }
}

window.releaseManualBooking = async function(bookingId, slotId) {
    if (!confirm('هل أنت متأكد من فك القفل وإتاحة هذا الموعد للعملاء مرة أخرى؟')) return;
    
    try {
        const { error } = await supabaseClient
            .from('bookings')
            .update({ status: 'cancelled' })
            .eq('id', bookingId);
            
        if (error) throw error;
        await loadSlots(currentPitchId);
        
    } catch (err) {
        alert('فشل فك القفل: ' + err.message);
    }
};

async function handleAddSlot(e) {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    const errorDiv = document.getElementById('formError');
    const successDiv = document.getElementById('formSuccess');
    const pitchId = document.getElementById('pitchId').value;
    const dayOfWeek = parseInt(document.getElementById('dayOfWeek').value);
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    
    errorDiv.textContent = '';
    successDiv.textContent = '';
    
    if (startTime >= endTime) {
        errorDiv.textContent = "وقت النهاية يجب أن يكون بعد وقت البداية.";
        return;
    }
    
    btn.disabled = true;
    btn.innerHTML = 'جاري الإضافة...';
    
    try {
        const { error } = await supabaseClient
            .from('slots')
            .insert([{ pitch_id: pitchId, day_of_week: dayOfWeek, start_time: startTime, end_time: endTime, is_active: true }]);
            
        if (error) throw new Error("خطأ في إضافة الموعد: " + error.message);
        
        successDiv.textContent = 'تم إضافة الموعد بنجاح!';
        document.getElementById('startTime').value = '';
        document.getElementById('endTime').value = '';
        await loadSlots(pitchId);
        
    } catch (error) {
        errorDiv.textContent = error.message;
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'إضافة للمواعيد المتاحة';
        lucide.createIcons();
        setTimeout(() => { successDiv.textContent = ''; }, 3000);
    }
}

window.deleteSlot = async function(slotId) {
    if (!confirm('هل أنت متأكد من حذف هذا الموعد؟')) return;
    try {
        const { error } = await supabaseClient.from('slots').delete().eq('id', slotId);
        if (error) throw error;
        await loadSlots(currentPitchId);
    } catch (error) {
        alert("فشل الحذف: " + error.message);
    }
};

// ========================
// TAB SWITCHER
// ========================
window.switchTab = function(tab) {
    document.getElementById('panelBulk').style.display = tab === 'bulk' ? 'block' : 'none';
    document.getElementById('panelSingle').style.display = tab === 'single' ? 'block' : 'none';
    document.getElementById('tabBulk').classList.toggle('active', tab === 'bulk');
    document.getElementById('tabSingle').classList.toggle('active', tab === 'single');
};

// ========================
// BULK SLOT GENERATOR
// ========================
function getCheckedDays() {
    return Array.from(document.querySelectorAll('#daysCheckboxes input[type=checkbox]:checked'))
                .map(cb => parseInt(cb.value));
}

function generateSlotTimes(startTime, endTime, durationMins) {
    const slots = [];
    let [sh, sm] = startTime.split(':').map(Number);
    let [eh, em] = endTime.split(':').map(Number);
    let startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;

    while (startMins + durationMins <= endMins) {
        const slotStart = `${String(Math.floor(startMins/60)).padStart(2,'0')}:${String(startMins%60).padStart(2,'0')}`;
        const slotEndMins = startMins + durationMins;
        const slotEnd = `${String(Math.floor(slotEndMins/60)).padStart(2,'0')}:${String(slotEndMins%60).padStart(2,'0')}`;
        slots.push({ start: slotStart, end: slotEnd });
        startMins += durationMins;
    }
    return slots;
}

window.previewBulkSlots = function() {
    const days = getCheckedDays();
    const startTime = document.getElementById('bulkStartTime').value;
    const endTime = document.getElementById('bulkEndTime').value;
    const duration = parseInt(document.getElementById('bulkDuration').value);
    const errorDiv = document.getElementById('bulkError');

    errorDiv.textContent = '';
    if (days.length === 0) { errorDiv.textContent = 'اختار يوم واحد على الأقل'; return; }
    if (!startTime || !endTime) { errorDiv.textContent = 'تأكد من اختيار وقت البداية والنهاية'; return; }
    if (startTime >= endTime) { errorDiv.textContent = 'وقت البداية لازم يكون قبل وقت النهاية'; return; }

    const slotTimes = generateSlotTimes(startTime, endTime, duration);
    if (slotTimes.length === 0) { errorDiv.textContent = 'الوقت المختار مش كافي لحصة واحدة'; return; }

    const dayNames = { 0:'الأحد', 1:'الإثنين', 2:'الثلاثاء', 3:'الأربعاء', 4:'الخميس', 5:'الجمعة', 6:'السبت' };
    const previewDiv = document.getElementById('bulkPreview');
    const previewText = document.getElementById('bulkPreviewText');

    const dayLabels = days.map(d => dayNames[d]).join('، ');
    const timeLabels = slotTimes.map(s => `${s.start} – ${s.end}`).join(' &nbsp;|&nbsp; ');

    previewText.innerHTML = `
        <strong>الأيام:</strong> ${dayLabels}<br>
        <strong>عدد الحصص لكل يوم:</strong> ${slotTimes.length} حصة<br>
        <strong>إجمالي المواعيد:</strong> ${days.length * slotTimes.length} ميعاد<br>
        <strong>المواعيد:</strong> ${timeLabels}
    `;
    previewDiv.style.display = 'block';
};

document.addEventListener('DOMContentLoaded', () => {
    const bulkForm = document.getElementById('bulkSlotForm');
    if (bulkForm) {
        bulkForm.addEventListener('submit', handleBulkSlots);
    }
});

async function handleBulkSlots(e) {
    e.preventDefault();
    const btn = document.getElementById('bulkSubmitBtn');
    const errorDiv = document.getElementById('bulkError');
    const successDiv = document.getElementById('bulkSuccess');

    const days = getCheckedDays();
    const startTime = document.getElementById('bulkStartTime').value;
    const endTime = document.getElementById('bulkEndTime').value;
    const duration = parseInt(document.getElementById('bulkDuration').value);
    const pitchId = document.getElementById('pitchIdBulk').value;

    errorDiv.textContent = '';
    successDiv.textContent = '';

    if (days.length === 0) { errorDiv.textContent = 'اختار يوم واحد على الأقل'; return; }
    if (startTime >= endTime) { errorDiv.textContent = 'وقت البداية لازم يكون قبل وقت النهاية'; return; }

    const slotTimes = generateSlotTimes(startTime, endTime, duration);
    if (slotTimes.length === 0) { errorDiv.textContent = 'الوقت المختار مش كافي لحصة واحدة'; return; }

    btn.disabled = true;
    btn.textContent = 'بيتولد المواعيد...';

    try {
        // Build all rows to insert
        const rows = [];
        for (const day of days) {
            for (const slot of slotTimes) {
                rows.push({
                    pitch_id: pitchId,
                    day_of_week: day,
                    start_time: slot.start,
                    end_time: slot.end,
                    is_active: true
                });
            }
        }

        // Delete existing slots for this pitch first to avoid duplicates
        if (confirm(`هيتمسح المواعيد القديمة ويتولد ${rows.length} ميعاد جديد. تأكد؟`)) {
            await supabaseClient.from('slots').delete().eq('pitch_id', pitchId);
            const { error } = await supabaseClient.from('slots').insert(rows);
            if (error) throw error;

            successDiv.textContent = `✅ تم توليد ${rows.length} ميعاد بنجاح!`;
            document.getElementById('bulkPreview').style.display = 'none';
            await loadSlots(pitchId);
        }
    } catch (err) {
        errorDiv.textContent = 'حدث خطأ: ' + err.message;
    } finally {
        btn.disabled = false;
        btn.textContent = '⚡ ولّد المواعيد';
        setTimeout(() => { successDiv.textContent = ''; }, 4000);
    }
}
