// js/supabase.js

const SUPABASE_URL = 'https://oynjigebowktsgtcjakj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7mJvYMguBmVTCdErRdBcDg_i2y-h81Q';

// Use window properties to avoid any let/const naming conflicts with the CDN library
window.supabaseClient = null;
window.currentUser = null;

(function () {
    // Access the CDN library via its full property path to avoid any collision
    const lib = window['supabase'];
    if (!lib || typeof lib.createClient !== 'function') {
        console.error('Supabase CDN library not loaded. Make sure the CDN script tag comes before supabase.js.');
        return;
    }

    window.supabaseClient = lib.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('Supabase client initialized successfully.');

    // Track auth state globally
    window.supabaseClient.auth.getSession().then(({ data: { session } }) => {
        window.currentUser = session?.user ?? null;
    });

    window.supabaseClient.auth.onAuthStateChange((_event, session) => {
        window.currentUser = session?.user ?? null;
    });
})();
