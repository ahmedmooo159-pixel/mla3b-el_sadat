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

async function handleSignup(email, password, phone) {
    const errorDiv = document.getElementById('authError');
    const successDiv = document.getElementById('authSuccess');
    const btn = document.getElementById('signupSubmitBtn');
    
    errorDiv.textContent = '';
    successDiv.textContent = '';
    btn.disabled = true;
    btn.textContent = 'جاري الإنشاء...';
    
    const { data, error } = await window.supabaseClient.auth.signUp({ email, password });
    
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
            successDiv.textContent = 'تم إنشاء الحساب بنجاح! جاري تحويلك...';
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
        }
    }
}

async function handleLogout() {
    await window.supabaseClient.auth.signOut();
    window.location.href = 'index.html';
}

// Initialize auth listeners after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (window.supabaseClient) {
        checkSession();
        window.supabaseClient.auth.onAuthStateChange((event, session) => {
            window.currentUser = session?.user || null;
            if (event === 'SIGNED_OUT') {
                const path = window.location.pathname;
                const isProtectedRoute = path.includes('dashboard.html') || path.includes('create-pitch.html');
                if (isProtectedRoute) {
                    window.location.href = 'index.html';
                }
            }
        });
    }
});
