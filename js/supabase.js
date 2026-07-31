// js/supabase.js

const SUPABASE_URL = 'https://oynjigebowktsgtcjakj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7mJvYMguBmVTCdErRdBcDg_i2y-h81Q';

let supabase = null;
let currentUser = null;

if (window.supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('Supabase client initialized.');
    
    // Track auth state globally
    supabase.auth.getSession().then(({ data: { session } }) => {
        currentUser = session?.user ?? null;
    });
    
    supabase.auth.onAuthStateChange((_event, session) => {
        currentUser = session?.user ?? null;
    });
} else {
    console.error('Supabase library not loaded. Make sure the CDN script is included.');
}
