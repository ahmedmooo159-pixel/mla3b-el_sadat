// js/pitch.js

async function loadAreasForPitch() {
    try {
        const { data, error } = await supabaseClient.from('platform_settings').select('areas').single();
        const select = document.getElementById('pitchLocation');
        if (!error && data && data.areas && select) {
            select.innerHTML = '<option value="" disabled selected>اختر المنطقة</option>';
            data.areas.forEach(area => {
                const opt = document.createElement('option');
                opt.value = area;
                opt.textContent = area;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.error(e);
    }
}

if (typeof supabaseClient !== 'undefined') {
    document.addEventListener('DOMContentLoaded', loadAreasForPitch);
}

async function handlePitchCreation(e) {
    e.preventDefault();
    
    if (!currentUser) {
        alert("يجب تسجيل الدخول أولاً");
        window.location.href = 'login.html';
        return;
    }
    
    const btn = document.getElementById('submitBtn');
    const errorDiv = document.getElementById('formError');
    const successDiv = document.getElementById('formSuccess');
    
    const name = document.getElementById('pitchName').value;
    const location = document.getElementById('pitchLocation').value;
    const price = parseFloat(document.getElementById('pitchPrice').value);
    const vCash = document.getElementById('vodafoneCash').value;
    const instaPay = document.getElementById('instapayLink').value;
    const cancelCutoff = parseInt(document.getElementById('cancelCutoffHours').value) || 24;
    const refundPercent = parseInt(document.getElementById('refundPercentAfterCutoff').value) || 0;
    const telegramId = document.getElementById('telegramId').value;
    const photoInput = document.getElementById('pitchPhoto');
    
    errorDiv.textContent = '';
    successDiv.textContent = '';
    btn.disabled = true;
    btn.innerHTML = 'جاري الحفظ...';
    
    try {
        let photoUrl = '';
        
        // 1. Upload photo to storage
        if (photoInput.files.length > 0) {
            const file = photoInput.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${currentUser.id}/${fileName}`;
            
            const { error: uploadError } = await supabaseClient.storage
                .from('pitch_photos')
                .upload(filePath, file);
                
            if (uploadError) throw new Error("فشل رفع الصورة: " + uploadError.message);
            
            // Get public URL
            const { data: { publicUrl } } = supabaseClient.storage
                .from('pitch_photos')
                .getPublicUrl(filePath);
                
            photoUrl = publicUrl;
        }
        
        // 2. Insert pitch record
        const { error: insertError } = await supabaseClient
            .from('pitches')
            .insert([{
                owner_id: currentUser.id,
                name: name,
                location: location,
                price_per_hour: price,
                vodafone_cash: vCash,
                instapay_link: instaPay,
                cancel_cutoff_hours: cancelCutoff,
                refund_percent_after_cutoff: refundPercent,
                photos: photoUrl ? [photoUrl] : [],
                subscription_status: 'inactive'
            }]);
            
        if (insertError) throw new Error("فشل حفظ الملعب: " + insertError.message);
        
        // 3. Update owner's telegram ID
        const { error: ownerError } = await supabaseClient
            .from('owners')
            .update({ telegram_chat_id: telegramId })
            .eq('id', currentUser.id);
            
        if (ownerError) throw new Error("تم حفظ الملعب ولكن فشل تحديث بيانات المالك: " + ownerError.message);
        
        successDiv.textContent = 'تم إضافة الملعب بنجاح! جاري تحويلك للوحة التحكم...';
        
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1500);
        
    } catch (error) {
        errorDiv.textContent = error.message;
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="save"></i> حفظ الملعب';
        lucide.createIcons();
    }
}
