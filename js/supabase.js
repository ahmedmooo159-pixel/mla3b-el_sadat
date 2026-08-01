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
