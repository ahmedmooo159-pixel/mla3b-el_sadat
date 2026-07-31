// js/supabase.js

const SUPABASE_URL = 'https://oynjigebowktsgtcjakj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7mJvYMguBmVTCdErRdBcDg_i2y-h81Q';

let supabaseClient = null;
let currentUser = null;

if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('Supabase client initialized.');
    
    // Track auth state globally
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        currentUser = session?.user ?? null;
    });
    
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        currentUser = session?.user ?? null;
    });
} else {
    console.error('Supabase library not loaded. Make sure the CDN script is included.');
}
