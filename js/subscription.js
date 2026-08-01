// js/subscription.js

// Fetch platform settings on load
async function loadPlatformSettings() {
    try {
        const { data, error } = await supabaseClient
            .from('platform_settings')
            .select('*')
            .single();
            
        if (error) {
            console.error("Error loading platform settings:", error);
            return;
        }
        
        if (data) {
            const vCashEl = document.getElementById('vodafoneCashNumber');
            const instaPayEl = document.getElementById('instapayLink');
            const subFeeEl = document.getElementById('subscriptionFee');
            
            if (vCashEl && data.vodafone_cash_number) vCashEl.textContent = data.vodafone_cash_number;
            if (instaPayEl && data.instapay_link) instaPayEl.textContent = data.instapay_link;
            if (subFeeEl && data.monthly_subscription_fee) subFeeEl.textContent = data.monthly_subscription_fee;
        }
    } catch (err) {
        console.error("Failed to load settings:", err);
    }
}

async function handleSubscriptionUpload(e) {
    e.preventDefault();
    
    if (!currentUser) {
        alert("يجب تسجيل الدخول أولاً");
        window.location.href = 'login.html';
        return;
    }
    
    const btn = document.getElementById('submitBtn');
    const errorDiv = document.getElementById('formError');
    const successDiv = document.getElementById('formSuccess');
    
    const pitchId = document.getElementById('pitchId').value;
    const photoInput = document.getElementById('paymentScreenshot');
    
    errorDiv.textContent = '';
    successDiv.textContent = '';
    btn.disabled = true;
    btn.innerHTML = 'جاري الرفع وإرسال الإشعار...';
    
    try {
        if (photoInput.files.length === 0) {
            throw new Error("يرجى اختيار صورة الإيصال");
        }
        
        // Fetch pitch and owner details for the notification
        const { data: pitchData, error: pitchError } = await supabaseClient
            .from('pitches')
            .select('name, owners(full_name, phone)')
            .eq('id', pitchId)
            .single();
            
        if (pitchError) throw new Error("الملعب غير موجود");
        
        const file = photoInput.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${pitchId}_${Date.now()}.${fileExt}`;
        const filePath = `${currentUser.id}/${fileName}`;
        
        // 1. Upload proof to storage
        const { error: uploadError } = await supabaseClient.storage
            .from('payment_proofs')
            .upload(filePath, file);
            
        if (uploadError) throw new Error("فشل رفع الصورة: " + uploadError.message);
        
        // Create a signed URL valid for 7 days so the admin can view it directly from Telegram
        const { data: signedUrlData, error: signedUrlError } = await supabaseClient.storage
            .from('payment_proofs')
            .createSignedUrl(filePath, 60 * 60 * 24 * 7);
            
        const receiptUrl = signedUrlError ? 'رابط غير متاح (افتح لوحة التحكم)' : signedUrlData.signedUrl;
        
        // 2. Update pitch status to 'pending'
        const { error: updateError } = await supabaseClient
            .from('pitches')
            .update({ subscription_status: 'pending' })
            .eq('id', pitchId)
            .eq('owner_id', currentUser.id);
            
        if (updateError) throw new Error("تم رفع الصورة ولكن فشل تحديث حالة الملعب: " + updateError.message);
        
        // 3. Invoke Telegram Edge Function
        const { data: fnData, error: fnError } = await supabaseClient.functions.invoke('notify-subscription', {
            body: { 
                receiptUrl: receiptUrl,
                pitchName: pitchData.name,
                ownerName: pitchData.owners.full_name || pitchData.owners.phone || 'مالك'
            }
        });
        
        if (fnError) {
            console.error("Telegram Notification Error:", fnError);
            // We don't throw an error to the user because their upload succeeded.
        }
        
        successDiv.textContent = 'تم إرسال طلبك بنجاح! سيتم المراجعة وتفعيل الملعب قريباً.';
        
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 2000);
        
    } catch (error) {
        errorDiv.textContent = error.message;
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="upload-cloud"></i> إرسال للمراجعة';
        lucide.createIcons();
    }
}

// Ensure the page loads settings if supabaseClient is ready
if (typeof supabaseClient !== 'undefined') {
    loadPlatformSettings();
} else {
    document.addEventListener('DOMContentLoaded', () => {
        if (supabaseClient) loadPlatformSettings();
    });
}
