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

function timeStrToMins(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
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
        
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const { data: bookings, error: bErr } = await supabaseClient
            .from('bookings')
            .select('*')
            .eq('pitch_id', pitchId)
            .gte('booking_date', todayStr);

        await renderSlots(slots, bookings || []);
        await loadBookingsList(pitchId, bookings || []);
        loading.style.display = 'none';
        
    } catch (error) {
        console.error("Error loading slots:", error);
        loading.textContent = "حدث خطأ أثناء تحميل المواعيد.";
    }
}

function formatTimeDisplay(timeStr) {
    if (window.formatEgyptianTime) return window.formatEgyptianTime(timeStr);
    const [h, m] = timeStr.split(':');
    const d = new Date(); d.setHours(h, m);
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

async function renderSlots(slots, bookings) {
    const listDiv = document.getElementById('slotsList');
    listDiv.innerHTML = '';
    
    const now = new Date();
    const activeBookings = bookings.filter(b => {
        if (b.status === 'rejected' || b.status === 'cancelled') return false;
        if (b.status === 'pending_payment' && (now - new Date(b.created_at)) / 60000 > 10) return false;
        return true;
    });
    
    slots.forEach(slot => {
        const nextDate = getNextDateForDay(slot.day_of_week);
        const slotStart = timeStrToMins(slot.start_time);
        const slotEnd = timeStrToMins(slot.end_time);

        const booking = activeBookings.find(b => {
            if (b.booking_date !== nextDate) return false;
            
            let bs = 0, be = 0;
            if (b.start_time && b.end_time) {
                bs = timeStrToMins(b.start_time);
                be = timeStrToMins(b.end_time);
            } else if (b.slot_id === slot.id) {
                bs = slotStart;
                be = slotEnd;
            } else {
                return false;
            }
            return bs < slotEnd && be > slotStart;
        });

        const isBooked = !!booking;
        
        const el = document.createElement('div');
        el.className = `slot-card${isBooked ? ' manual-booked' : ''}`;
        
        let labelText = 'متاح';
        let statusStyle = '';
        if (isBooked) {
            labelText = booking.source === 'manual' ? 'محجوز يدوياً' : 'محجوز أونلاين';
            statusStyle = 'background: rgba(245, 158, 11, 0.2); color: #f59e0b;';
        }
        const statusBadge = `<span class="status-badge" style="${statusStyle}">${labelText}</span>`;
        
        const actionBtn = isBooked
            ? `<button class="release-btn" onclick="releaseManualBooking('${booking.id}', '${slot.id}')">
                 🔓 فك القفل وإتاحة الموعد
               </button>`
            : `<button class="manual-book-btn" onclick="openManualModal('${slot.id}', '${nextDate}', '${daysMap[slot.day_of_week]}', '${formatTimeDisplay(slot.start_time)}', '${formatTimeDisplay(slot.end_time)}', '${slot.start_time}', '${slot.end_time}')">
                 📋 حجز يدوي (كاش/تليفون)
               </button>`;
        
        el.innerHTML = `
            <div class="slot-day">${daysMap[slot.day_of_week]}</div>
            <div class="slot-time" style="justify-content: center; font-size: 0.9rem; margin-top: 5px;">
                <i data-lucide="clock" style="width: 14px; height: 14px;"></i>
                ${formatTimeDisplay(slot.start_time)} - ${formatTimeDisplay(slot.end_time)}
            </div>
            <div style="margin-top: 8px;">${statusBadge}</div>
            ${isBooked && booking.notes ? `<p style="font-size:0.8rem; color:var(--text-muted); margin-top:5px;">${booking.notes}</p>` : ''}
            ${isBooked && booking.customer_name && booking.source !== 'manual' ? `<p style="font-size:0.8rem; color:var(--text-muted); margin-top:5px;">العميل: ${booking.customer_name}</p>` : ''}
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

// Render bookings list at the bottom of the page
async function loadBookingsList(pitchId, bookings) {
    const container = document.getElementById('bookingsListContainer');
    if (!container) return;
    
    const now = new Date();
    const activeBookings = bookings.filter(b => {
        if (b.status === 'rejected' || b.status === 'cancelled') return false;
        if (b.status === 'pending_payment' && (now - new Date(b.created_at)) / 60000 > 10) return false;
        return true;
    });
    
    // Sort bookings by date and time
    activeBookings.sort((a, b) => {
        const dateDiff = a.booking_date.localeCompare(b.booking_date);
        if (dateDiff !== 0) return dateDiff;
        const aStart = a.start_time || '';
        const bStart = b.start_time || '';
        return aStart.localeCompare(bStart);
    });
    
    if (activeBookings.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 30px;">
                <i data-lucide="inbox"></i>
                <p>مفيش أي حجوزات مؤكدة أو معلقة حالياً.</p>
            </div>`;
        lucide.createIcons();
        return;
    }
    
    container.innerHTML = '';
    activeBookings.forEach(b => {
        const bookingDate = new Date(b.booking_date + 'T00:00:00').toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        let timeStr = 'ميعاد غير محدد';
        if (b.start_time && b.end_time) {
            timeStr = `${formatTimeDisplay(b.start_time)} - ${formatTimeDisplay(b.end_time)}`;
        }
            
        const statusLabel = b.status === 'confirmed' ? 'مؤكد ✅' : 'في انتظار الدفع (مؤقت)';
        const statusColor = b.status === 'confirmed' ? '#10b981' : '#f59e0b';
        const sourceLabel = b.source === 'manual' ? 'حجز يدوي' : 'حجز أونلاين';
        
        const card = document.createElement('div');
        card.style.cssText = 'background: rgba(15, 23, 42, 0.4); border: 1px solid var(--border-color); border-radius: 12px; padding: 15px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 8px;';
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 5px;">
                <strong style="color: var(--primary-color); font-size: 1rem;">${b.customer_name || 'عميل'}</strong>
                <span style="background: ${statusColor}20; color: ${statusColor}; padding: 3px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: bold; border: 1px solid ${statusColor}50;">
                    ${statusLabel}
                </span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.85rem; color: var(--text-light);">
                <p>📞 <strong>رقم الهاتف:</strong> ${b.customer_phone}</p>
                <p>📅 <strong>التاريخ:</strong> ${bookingDate}</p>
                <p>⏰ <strong>الوقت:</strong> ${timeStr}</p>
                <p>ℹ️ <strong>النوع:</strong> ${sourceLabel} ${b.notes ? `(${b.notes})` : ''}</p>
            </div>
        `;
        container.appendChild(card);
    });
    lucide.createIcons();
}

// Manual Booking Modal
window.openManualModal = function(slotId, dateStr, dayName, startTime, endTime, rawStart, rawEnd) {
    document.getElementById('manualSlotId').value = slotId;
    document.getElementById('manualBookingDate').value = dateStr;
    window._manualStartTime = rawStart;
    window._manualEndTime = rawEnd;
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
                pitch_id: currentPitchId,
                slot_id: slotId,
                booking_date: bookingDate,
                start_time: window._manualStartTime || null,
                end_time: window._manualEndTime || null,
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
    
    if (startTime === endTime) {
        errorDiv.textContent = "وقت النهاية لا يمكن أن يساوي وقت البداية.";
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
    let endMins = eh * 60 + em;

    if (endMins <= startMins) {
        endMins += 24 * 60; // Handle overnight slots
    }

    while (startMins + durationMins <= endMins) {
        const hStart = Math.floor((startMins % 1440) / 60);
        const mStart = startMins % 60;
        const slotStart = `${String(hStart).padStart(2,'0')}:${String(mStart).padStart(2,'0')}`;
        
        const slotEndMins = startMins + durationMins;
        const hEnd = Math.floor((slotEndMins % 1440) / 60);
        const mEnd = slotEndMins % 60;
        const slotEnd = `${String(hEnd).padStart(2,'0')}:${String(mEnd).padStart(2,'0')}`;
        
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
    if (startTime === endTime) { errorDiv.textContent = 'وقت البداية والنهاية مينفعش يكونوا زي بعض'; return; }

    const slotTimes = generateSlotTimes(startTime, endTime, duration);
    if (slotTimes.length === 0) { errorDiv.textContent = 'الوقت المختار مش كافي لحصة واحدة'; return; }

    const dayNames = { 0:'الأحد', 1:'الإثنين', 2:'الثلاثاء', 3:'الأربعاء', 4:'الخميس', 5:'الجمعة', 6:'السبت' };
    const previewDiv = document.getElementById('bulkPreview');
    const previewText = document.getElementById('bulkPreviewText');

    const dayLabels = days.map(d => dayNames[d]).join('، ');
    const timeLabels = slotTimes.map(s => `${formatTimeDisplay(s.start)} – ${formatTimeDisplay(s.end)}`).join(' &nbsp;|&nbsp; ');

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
    if (startTime === endTime) { errorDiv.textContent = 'وقت البداية والنهاية مينفعش يكونوا زي بعض'; return; }

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
