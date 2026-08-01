// js/supabase.js

const SUPABASE_URL = 'https://oynjigebowktsgtcjakj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7mJvYMguBmVTCdErRdBcDg_i2y-h81Q';

window.supabaseClient = null;
window.currentUser = null;

console.log('supabase.js loading...');

// استنى للـ CDN تحمّل
function initializeSupabase() {
    const lib = window['supabase'];
    
    console.log('Checking supabase library:', !!lib);
    console.log('Has createClient?', lib && typeof lib.createClient === 'function');
    
    if (!lib || typeof lib.createClient !== 'function') {
        console.error('Supabase library not loaded properly');
        // استنى شوية وجرّب مرة تانية
        setTimeout(initializeSupabase, 500);
        return;
    }

    try {
        window.supabaseClient = lib.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('✅ Supabase client initialized successfully');
        
        // Get initial session
        window.supabaseClient.auth.getSession().then(({ data: { session }, error }) => {
            if (error) {
                console.error('❌ Error getting session:', error);
            } else {
                window.currentUser = session?.user ?? null;
                console.log('✅ Session loaded:', window.currentUser?.email || 'No user');
            }
        });
        
        // Listen to auth changes
        window.supabaseClient.auth.onAuthStateChange((_event, session) => {
            window.currentUser = session?.user ?? null;
            console.log('Auth state changed:', _event, '| User:', window.currentUser?.email || 'None');
        });
    } catch (err) {
        console.error('❌ Error initializing Supabase:', err);
    }
}

// استنى لما الـ DOM يحمّل
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSupabase);
} else {
    initializeSupabase();
}

// أضيف timeout failsafe
setTimeout(() => {
    if (!window.supabaseClient) {
        console.error('Supabase client still not loaded after 5 seconds');
        initializeSupabase();
    }
}, 5000);

// Global floating banner for pending bookings
function checkPendingBooking() {
    const pending = localStorage.getItem('pending_booking');
    if (!pending) return;
    
    try {
        const booking = JSON.parse(pending);
        const now = new Date();
        const expiresAt = new Date(booking.expiresAt);
        const minsLeft = Math.ceil((expiresAt - now) / 60000);
        
        if (minsLeft > 0 && minsLeft <= 10) {
            // Create a floating top banner
            const banner = document.createElement('div');
            banner.id = 'pendingBookingBanner';
            banner.style.cssText = 'background: linear-gradient(90deg, #f59e0b, #d97706); color: #000; padding: 12px 20px; text-align: center; font-weight: bold; position: fixed; top: 0; left: 0; right: 0; z-index: 99999; display: flex; justify-content: center; align-items: center; gap: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); font-family: Cairo, sans-serif;';
            banner.innerHTML = `
                <span>⚠️ عندك حجز مؤقت لـ "${booking.pitchName}"! ارفع الإيصال قبل ما الـ 10 دقايق يخلصوا (متبقي ${minsLeft} دقائق)</span>
                <a href="pay-booking.html?id=${booking.id}" style="background: #000; color: #fff; padding: 6px 12px; border-radius: 8px; text-decoration: none; font-size: 0.85rem; transition: all 0.3s; white-space: nowrap;">اضغط هنا لرفع الإيصال 🚀</a>
            `;
            
            document.body.style.paddingTop = '50px';
            document.body.appendChild(banner);
        } else {
            // Expired, clear it
            localStorage.removeItem('pending_booking');
        }
    } catch (e) {
        localStorage.removeItem('pending_booking');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Run after a short delay so layout stabilizes
    setTimeout(checkPendingBooking, 500);
});