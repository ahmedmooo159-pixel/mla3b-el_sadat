// js/auth.js
// Note: supabaseClient and currentUser are declared on window in supabase.js

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
    if (user) {
        if (loginBtn) {
            loginBtn.textContent = 'لوحة التحكم';
            loginBtn.onclick = () => window.location.href = 'dashboard.html';
        }
    } else {
        if (loginBtn) {
            loginBtn.textContent = 'دخول أصحاب الملاعب';
            loginBtn.onclick = () => window.location.href = 'login.html';
        }
    }
}

async function handleLogin(email, password) {
    const errorDiv = document.getElementById('authError');
    const btn = document.getElementById('loginSubmitBtn');
    errorDiv.textContent = '';
    btn.disabled = true;
    btn.textContent = 'جاري الدخول...';
    
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
    
    if (error) {
        errorDiv.textContent = error.message;
        btn.disabled = false;
        btn.textContent = 'دخول';
    } else {
        window.location.href = 'dashboard.html';
    }
}

async function handleSignup(email, password, phone, fullName) {
    const errorDiv = document.getElementById('authError');
    const successDiv = document.getElementById('authSuccess');
    const btn = document.getElementById('signupSubmitBtn');
    
    errorDiv.textContent = '';
    successDiv.textContent = '';
    btn.disabled = true;
    btn.textContent = 'جاري الإنشاء...';
    
    try {
        // تأخير بسيط لتجنب rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
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
                { id: userId, email: email, phone: phone, full_name: fullName }
            ]);
            
            if (dbError) {
                errorDiv.textContent = 'الحساب اتعمل بس في مشكلة في حفظ البيانات: ' + dbError.message;
                btn.disabled = false;
                btn.textContent = 'اعمل الحساب';
            } else {
                successDiv.textContent = 'تم إنشاء الحساب بنجاح! جاري تحويلك...';
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
    await window.supabaseClient.auth.signOut();
    window.location.href = 'index.html';
}

// Initialize auth listeners after DOM is ready
// Initialize auth listeners after DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    if (!window.supabaseClient) {
        console.error('Supabase client not initialized');
        return;
    }
    
    console.log('DOMContentLoaded - initializing auth');
    
    // Get current session
    try {
        const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
        
        if (sessionError) {
            console.error('Session error:', sessionError);
        }
        
        window.currentUser = session?.user || null;
        console.log('Session loaded, currentUser:', window.currentUser);
        
        if (window.currentUser) {
            checkSession();
            console.log('User logged in, ID:', window.currentUser.id);
        }
    } catch (err) {
        console.error('Error getting session:', err);
    }
    
    // Listen for auth changes
    window.supabaseClient.auth.onAuthStateChange((event, session) => {
        window.currentUser = session?.user || null;
        console.log('Auth state changed:', event, 'User:', window.currentUser?.id);
        
        if (event === 'SIGNED_OUT') {
            const path = window.location.pathname;
            const isProtectedRoute = path.includes('dashboard.html') || path.includes('create-pitch.html');
            if (isProtectedRoute) {
                window.location.href = 'index.html';
            }
        }
    });
});