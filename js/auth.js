// js/auth.js - Version 2.0 - Fixed and Stable

// ============ UTILITY FUNCTIONS ============
async function checkSession() {
    if (!window.supabaseClient) return;
    
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        window.currentUser = session?.user || null;
        
        const path = window.location.pathname;
        const isAuthPage = path.includes('login.html') || path.includes('signup.html');
        const isProtectedRoute = path.includes('dashboard.html') || path.includes('create-pitch.html');
        
        if (window.currentUser && isAuthPage) {
            window.location.href = 'dashboard.html';
        } else if (!window.currentUser && isProtectedRoute) {
            window.location.href = 'login.html';
        }
        
        updateUIForAuth(window.currentUser);
    } catch (error) {
        console.error('Error checking session:', error);
    }
}

function updateUIForAuth(user) {
    const loginBtn = document.getElementById('loginBtn');
    if (!loginBtn) return; // Safety check
    
    if (user) {
        loginBtn.textContent = 'لوحة التحكم';
        loginBtn.onclick = () => window.location.href = 'dashboard.html';
    } else {
        loginBtn.textContent = 'دخول أصحاب الملاعب';
        loginBtn.onclick = () => window.location.href = 'login.html';
    }
}

// ============ AUTH FUNCTIONS ============
async function handleLogin(email, password) {
    const errorDiv = document.getElementById('authError');
    const btn = document.getElementById('loginSubmitBtn');
    
    if (!errorDiv || !btn) {
        console.error('Auth form elements not found');
        return;
    }
    
    errorDiv.textContent = '';
    btn.disabled = true;
    btn.textContent = 'جاري الدخول...';
    
    try {
        if (!window.supabaseClient) {
            throw new Error('Supabase client not initialized');
        }
        
        const { data, error } = await window.supabaseClient.auth.signInWithPassword({ 
            email, 
            password 
        });
        
        if (error) {
            errorDiv.textContent = error.message;
            btn.disabled = false;
            btn.textContent = 'دخول';
        } else {
            window.location.href = 'dashboard.html';
        }
    } catch (err) {
        errorDiv.textContent = 'خطأ: ' + err.message;
        btn.disabled = false;
        btn.textContent = 'دخول';
    }
}

async function handleSignup(email, password, phone) {
    const errorDiv = document.getElementById('authError');
    const successDiv = document.getElementById('authSuccess');
    const btn = document.getElementById('signupSubmitBtn');
    
    if (!errorDiv || !btn) {
        console.error('Signup form elements not found');
        return;
    }
    
    errorDiv.textContent = '';
    if (successDiv) successDiv.textContent = '';
    btn.disabled = true;
    btn.textContent = 'جاري الإنشاء...';
    
    try {
        // تأخير بسيط لتجنب rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (!window.supabaseClient) {
            throw new Error('Supabase client not initialized');
        }
        
        const { data, error } = await window.supabaseClient.auth.signUp({ 
            email, 
            password,
            options: {
                emailRedirectTo: `${window.location.origin}/auth/callback`
            }
        });
        
        if (error) {
            errorDiv.textContent = error.message;
            btn.disabled = false;
            btn.textContent = 'اعمل الحساب';
        } else {
            const userId = data.user.id;
            const { error: dbError } = await window.supabaseClient.from('owners').insert([
                { id: userId, email: email, phone: phone }
            ]);
            
            if (dbError) {
                errorDiv.textContent = 'الحساب اتعمل بس في مشكلة في حفظ البيانات: ' + dbError.message;
                btn.disabled = false;
                btn.textContent = 'اعمل الحساب';
            } else {
                if (successDiv) successDiv.textContent = 'تم إنشاء الحساب بنجاح! جاري تحويلك...';
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 1500);
            }
        }
    } catch (err) {
        errorDiv.textContent = 'خطأ: ' + err.message;
        btn.disabled = false;
        btn.textContent = 'اعمل الحساب';
    }
}

async function handleLogout() {
    try {
        await window.supabaseClient.auth.signOut();
        window.location.href = 'index.html';
    } catch (err) {
        console.error('Logout error:', err);
    }
}

// ============ INITIALIZATION ============
function initializeAuth() {
    console.log('Auth initialization started');
    
    if (!window.supabaseClient) {
        console.error('Supabase client not available yet, retrying in 500ms...');
        setTimeout(initializeAuth, 500);
        return;
    }
    
    // Get current session
    window.supabaseClient.auth.getSession()
        .then(({ data: { session }, error }) => {
            if (error) {
                console.error('Session error:', error);
            } else {
                window.currentUser = session?.user || null;
                console.log('✅ Session loaded:', window.currentUser?.email || 'No user');
                checkSession();
            }
        })
        .catch(err => console.error('Error getting session:', err));
    
    // Listen for auth state changes
    window.supabaseClient.auth.onAuthStateChange((event, session) => {
        window.currentUser = session?.user || null;
        console.log('Auth state changed:', event);
        
        if (event === 'SIGNED_OUT') {
            const path = window.location.pathname;
            if (path.includes('dashboard.html') || path.includes('create-pitch.html')) {
                window.location.href = 'index.html';
            }
        }
    });
}

// Start initialization when document is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAuth);
} else {
    initializeAuth();
}