// js/auth.js

let currentUser = null;

async function checkSession() {
    if (!supabase) return;
    
    try {
        const { data: { session } } = await supabase.auth.getSession();
        currentUser = session?.user || null;
        
        const path = window.location.pathname;
        const isAuthPage = path.includes('login.html') || path.includes('signup.html');
        const isProtectedRoute = path.includes('dashboard.html') || path.includes('create-pitch.html');
        
        if (currentUser && isAuthPage) {
            window.location.href = 'dashboard.html';
        } else if (!currentUser && isProtectedRoute) {
            window.location.href = 'login.html';
        }
        
        updateUIForAuth(currentUser);
    } catch (error) {
        console.error('Error checking session:', error);
    }
}

function updateUIForAuth(user) {
    const loginBtn = document.getElementById('loginBtn');
    if (user) {
        if(loginBtn) {
            loginBtn.textContent = 'لوحة التحكم';
            loginBtn.onclick = () => window.location.href = 'dashboard.html';
        }
    } else {
        if(loginBtn) {
            loginBtn.textContent = 'تسجيل الدخول للمالكين';
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
    
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
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
    
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });
    
    if (error) {
        errorDiv.textContent = error.message;
        btn.disabled = false;
        btn.textContent = 'إنشاء الحساب';
    } else {
        // Insert into public.owners
        const userId = data.user.id;
        const { error: dbError } = await supabase.from('owners').insert([
            { id: userId, email: email, phone: phone }
        ]);
        
        if (dbError) {
            errorDiv.textContent = 'Account created, but failed to save profile: ' + dbError.message;
            btn.disabled = false;
            btn.textContent = 'إنشاء الحساب';
        } else {
            successDiv.textContent = 'تم إنشاء الحساب بنجاح! جاري تحويلك...';
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
        }
    }
}

async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = 'index.html';
}

if (supabase) {
    checkSession();
    supabase.auth.onAuthStateChange((event, session) => {
        currentUser = session?.user || null;
        if (event === 'SIGNED_OUT') {
            const path = window.location.pathname;
            const isProtectedRoute = path.includes('dashboard.html') || path.includes('create-pitch.html');
            if (isProtectedRoute) {
                window.location.href = 'index.html';
            }
        }
    });
}
