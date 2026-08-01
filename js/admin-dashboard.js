// js/admin-dashboard.js

let allPitchesData = [];

document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();
    
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
            checkAndLoadAdmin(session.user.id);
        } else {
            window.location.href = 'index.html';
        }
    });
    
    if (currentUser) {
        checkAndLoadAdmin(currentUser.id);
    }
    
    document.getElementById('settingsForm').addEventListener('submit', saveSettings);
});

async function checkAndLoadAdmin(userId) {
    const loading = document.getElementById('loadingIndicator');
    const container = document.getElementById('adminContainer');
    const denied = document.getElementById('accessDeniedMsg');
    
    try {
        const { data: owner } = await supabaseClient
            .from('owners')
            .select('role')
            .eq('id', userId)
            .single();
            
        if (owner?.role === 'admin') {
            loading.style.display = 'none';
            container.style.display = 'block';
            
            // Load initial data
            loadPendingSubscriptions();
            loadAllPitches();
            loadSettings();
        } else {
            loading.style.display = 'none';
            denied.style.display = 'block';
        }
    } catch (err) {
        console.error("Auth check failed:", err);
        loading.style.display = 'none';
        denied.style.display = 'block';
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.section-panel').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.admin-nav button').forEach(el => el.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
}

// 1. Pending Subscriptions
async function loadPendingSubscriptions() {
    try {
        const { data: pitches, error } = await supabaseClient
            .from('pitches')
            .select(`
                id, name, location, price_per_hour, payment_proof_url, created_at,
                owners (full_name, phone)
            `)
            .eq('subscription_status', 'pending')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        const listDiv = document.getElementById('pendingSubscriptionsList');
        listDiv.innerHTML = '';
        
        if (!pitches || pitches.length === 0) {
            listDiv.innerHTML = `<div class="empty-state" style="padding: 30px;"><i data-lucide="check-circle" style="color: #10b981;"></i><p>لا توجد اشتراكات معلقة حالياً.</p></div>`;
            lucide.createIcons();
            return;
        }
        
        pitches.forEach(pitch => {
            let receiptBtn = '';
            if (pitch.payment_proof_url) {
                const { data: publicUrlData } = supabaseClient.storage
                    .from('payment_proofs')
                    .getPublicUrl(pitch.payment_proof_url);
                const url = publicUrlData.publicUrl;
                receiptBtn = `<button class="btn btn-outline" style="margin-bottom: 10px; width: 100%; border-color: #8b5cf6; color: #8b5cf6;" onclick="viewReceipt('${url}')"><i data-lucide="image"></i> عرض إيصال الدفع</button>`;
            }
            
            const el = document.createElement('div');
            el.className = 'admin-card';
            el.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <h4 style="color: var(--primary-color); margin-bottom: 5px;">${pitch.name}</h4>
                        <p style="font-size: 0.9rem; color: var(--text-muted);"><i data-lucide="user" style="width:14px;height:14px;"></i> ${pitch.owners?.full_name} (${pitch.owners?.phone})</p>
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 5px;">تم الطلب: ${new Date(pitch.created_at).toLocaleDateString('ar-EG')}</p>
                    </div>
                    <div style="text-align: left;">
                        ${receiptBtn}
                        <button class="btn" style="background: #10b981; color: white; width: 100%;" onclick="activateSubscription('${pitch.id}', this)"><i data-lucide="check"></i> تفعيل الاشتراك (30 يوم)</button>
                    </div>
                </div>
            `;
            listDiv.appendChild(el);
        });
        lucide.createIcons();
        
    } catch (err) {
        console.error("Error loading pending:", err);
    }
}

async function activateSubscription(pitchId, btnEl) {
    if (!confirm('تأكيد تفعيل الاشتراك لهذا الملعب؟')) return;
    btnEl.disabled = true;
    btnEl.textContent = 'جاري التفعيل...';
    
    try {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        
        const { error } = await supabaseClient
            .from('pitches')
            .update({ 
                subscription_status: 'active',
                subscription_expires_at: expiresAt.toISOString()
            })
            .eq('id', pitchId);
            
        if (error) throw error;
        
        btnEl.closest('.admin-card').style.opacity = '0.5';
        btnEl.textContent = 'تم التفعيل';
        setTimeout(() => {
            btnEl.closest('.admin-card').remove();
            loadAllPitches(); // Refresh the other tab
            if (document.getElementById('pendingSubscriptionsList').children.length === 0) {
                loadPendingSubscriptions(); // Show empty state
            }
        }, 1000);
        
    } catch (err) {
        alert('حدث خطأ: ' + err.message);
        btnEl.disabled = false;
        btnEl.textContent = 'تفعيل الاشتراك (30 يوم)';
    }
}

function viewReceipt(url) {
    document.getElementById('receiptImagePreview').src = url;
    document.getElementById('receiptModal').style.display = 'flex';
}

function closeReceiptModal() {
    document.getElementById('receiptModal').style.display = 'none';
}
window.closeReceiptModal = closeReceiptModal;

// 2. All Pitches
async function loadAllPitches() {
    try {
        const { data: pitches, error } = await supabaseClient
            .from('pitches')
            .select(`
                id, name, location, subscription_status, subscription_expires_at, created_at,
                owners (full_name, phone)
            `)
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        allPitchesData = pitches;
        renderPitches(allPitchesData);
    } catch (err) {
        console.error(err);
    }
}

function filterPitches(term) {
    const q = term.toLowerCase();
    const filtered = allPitchesData.filter(p => 
        p.name.toLowerCase().includes(q) || 
        (p.owners?.full_name || '').toLowerCase().includes(q)
    );
    renderPitches(filtered);
}

window.filterPitches = filterPitches;

function renderPitches(pitches) {
    const listDiv = document.getElementById('allPitchesList');
    listDiv.innerHTML = '';
    
    pitches.forEach(pitch => {
        let statusColor = '#94a3b8';
        let statusLabel = 'غير نشط';
        if (pitch.subscription_status === 'active') { statusColor = '#10b981'; statusLabel = 'نشط'; }
        if (pitch.subscription_status === 'pending') { statusColor = '#f59e0b'; statusLabel = 'معلق'; }
        
        const el = document.createElement('div');
        el.className = 'admin-card';
        el.style.padding = '15px';
        el.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div>
                    <h4 style="margin-bottom: 5px;">${pitch.name}</h4>
                    <p style="font-size: 0.85rem; color: var(--text-muted);">المالك: ${pitch.owners?.full_name} (${pitch.owners?.phone})</p>
                </div>
                <div style="text-align: left;">
                    <span style="background: ${statusColor}20; color: ${statusColor}; padding: 4px 10px; border-radius: 6px; font-size: 0.85rem; font-weight: bold; border: 1px solid ${statusColor}50;">
                        ${statusLabel}
                    </span>
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 5px;">الانتهاء: ${pitch.subscription_expires_at ? new Date(pitch.subscription_expires_at).toLocaleDateString('ar-EG') : '---'}</p>
                </div>
            </div>
        `;
        listDiv.appendChild(el);
    });
}

// 3. Settings
async function loadSettings() {
    try {
        const { data: settings } = await supabaseClient.from('platform_settings').select('*').eq('id', 1).single();
        if (settings) {
            document.getElementById('settingVCash').value = settings.vodafone_cash_number;
            document.getElementById('settingInstapay').value = settings.instapay_link;
            document.getElementById('settingMonthlyFee').value = settings.monthly_subscription_fee;
        }
    } catch (err) {
        console.error(err);
    }
}

async function saveSettings(e) {
    e.preventDefault();
    const btn = document.getElementById('saveSettingsBtn');
    btn.disabled = true;
    btn.textContent = 'جاري الحفظ...';
    
    try {
        const { error } = await supabaseClient
            .from('platform_settings')
            .update({
                vodafone_cash_number: document.getElementById('settingVCash').value,
                instapay_link: document.getElementById('settingInstapay').value,
                monthly_subscription_fee: parseFloat(document.getElementById('settingMonthlyFee').value)
            })
            .eq('id', 1);
            
        if (error) throw error;
        
        btn.textContent = 'تم حفظ الإعدادات بنجاح!';
        btn.style.background = '#10b981';
        setTimeout(() => {
            btn.textContent = 'حفظ الإعدادات';
            btn.style.background = '';
            btn.disabled = false;
        }, 2000);
        
    } catch (err) {
        alert('حدث خطأ: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'حفظ الإعدادات';
    }
}
