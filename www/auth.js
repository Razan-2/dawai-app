const supabaseUrl = 'https://krvvdvebxhhhqdzevgdu.supabase.co';
const supabaseKey = 'sb_publishable_we8u-bBYQKo5NIlIMtfZPA_fhG3LUz0';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

document.addEventListener('DOMContentLoaded', async () => {
    // Listen for auth state changes continuously
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            window.location.replace('index.html');
        }
    });

    // Check if user is already logged in
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (session && !error) {
        window.location.replace('index.html');
        return;
    }

    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const btn = document.getElementById('login-btn');
            const errorMsg = document.getElementById('error-msg');
            
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الدخول...';
            errorMsg.style.display = 'none';

            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) {
                // translate common error to Arabic for better UX
                errorMsg.innerText = error.message.includes('Invalid login') 
                                    ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة' 
                                    : error.message;
                errorMsg.style.display = 'block';
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> دخول';
            } else {
                window.location.replace('index.html');
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const btn = document.getElementById('register-btn');
            const errorMsg = document.getElementById('error-msg');
            
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التسجيل...';
            errorMsg.style.display = 'none';

            const { data, error } = await supabaseClient.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        name: name
                    }
                }
            });

            if (error) {
                errorMsg.innerText = error.message.includes('already registered')
                                    ? 'هذا البريد الإلكتروني مسجل مسبقاً'
                                    : error.message;
                errorMsg.style.display = 'block';
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> تسجيل حساب';
            } else {
                window.location.replace('index.html');
            }
        });
    }
});
