/**
 * Dawaee Web App - Core Logic
 */

// Supabase Configuration
// يرجى استبدال مفتاحك برابط ومفتاح مشروعك في Supabase
const supabaseUrl = 'https://krvvdvebxhhhqdzevgdu.supabase.co';
const supabaseKey = 'sb_publishable_we8u-bBYQKo5NIlIMtfZPA_fhG3LUz0';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// Initial Data
let medications = [];
let currentUser = null;

// Elements
const tabs = document.querySelectorAll('.tab-btn');
const views = document.querySelectorAll('.view');
const medListEl = document.getElementById('medications-list');
const addForm = document.getElementById('add-med-form');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Listen for auth state changes continuously
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            window.location.replace('login.html');
        }
    });

    // Check Auth Session
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (!session || error) {
        window.location.replace('login.html');
        return;
    }
    currentUser = session.user;
    
    // Update UI User Profile
    const userName = currentUser.user_metadata?.name || currentUser.email.split('@')[0];
    const nameDisplay = document.querySelector('.user-info h3');
    const avatarImg = document.querySelector('.user-profile .avatar');
    if (nameDisplay) nameDisplay.innerText = `أهلاً بك، ${userName}`;
    if (avatarImg) avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&length=1&background=e8f5e9&color=1a6fa8`;

    fetchMedications().then(() => {
        renderMedications();
        initAdherenceChart();
        updateNextMedication();
    });
    setupTabs();
    initTheme();
    initMap();
    initEmailJS();

    // Request Browser Notification Permission
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }

    // load previous theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        const themeSelect = document.getElementById('theme-select');
        if (themeSelect) themeSelect.value = 'dark';
    }

    // Check medication times every minute
    setInterval(checkMedicationTimes, 60000);

    // Initial check just in case
    checkMedicationTimes();

    // Edit Profile Setup
    const editForm = document.getElementById('edit-profile-form');
    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newName = document.getElementById('new-profile-name').value.trim();
            const btn = document.getElementById('save-profile-btn');
            
            if (!newName) return;

            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';

            // 1. تحديث اسم المستخدم في المصادقة (Auth)
            const { data: authData, error: authError } = await supabaseClient.auth.updateUser({
                data: { name: newName }
            });

            // 2. حفظ الاسم في جدول المستخدمين العام (users) بناءً على الإيميل
            if (currentUser && currentUser.email) {
                const { error: dbError } = await supabaseClient
                    .from('users')
                    .update({ name: newName })
                    .eq('email', currentUser.email);
                    
                if (dbError) {
                    console.error('Error updating users table:', dbError);
                    alert("تعذر تحديث قاعدة البيانات (تأكد من سياسات RLS في لوحة تحكم Supabase)");
                }
            }

            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-save"></i> حفظ التعديلات';

            if (authError) {
                console.error('Error updating profile:', authError);
                showNotification('خطأ', 'حدث خطأ أثناء تحديث الملف الشخصي');
            } else {
                // 3. تحديث مباشر للواجهة
                const updatedName = newName;
                if (nameDisplay) nameDisplay.innerText = `أهلاً بك، ${updatedName}`;
                if (avatarImg) avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(updatedName)}&length=1&background=e8f5e9&color=1a6fa8`;
                
                if(currentUser && currentUser.user_metadata) {
                    currentUser.user_metadata.name = updatedName;
                }

                closeModal('edit-profile-modal');
                // 4. إظهار رسالة نجاح
                showNotification('تم التحديث', 'تم تغيير اسمك وحفظه بنجاح.');
            }
        });
    }
});

// Fetch medications from Supabase
async function fetchMedications() {
    const { data, error } = await supabaseClient
        .from('medicines')
        .select('*')
        .eq('user_id', currentUser.id);

    if (error) {
        console.error('Error fetching medications:', error);
        return;
    }

    if (data) {
        // تحويل البيانات لكي تتناسب مع طريقة العرض
        medications = data.map(med => ({
            id: med.id,
            name: med.medicine_name,
            dose: med.dosage,
            type: med.type || 'pill', 
            time: med.time,
            instruction: med.instruction || 'بدون تحديد', 
            image_url: med.image_url || null,
            taken: false
        }));
    }
}

// Tab Navigation
function setupTabs() {
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active classes
            tabs.forEach(t => t.classList.remove('active'));
            views.forEach(v => v.classList.remove('active-view'));

            // Add active classes to selected
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-target');
            const targetView = document.getElementById(targetId);
            if(targetView) {
                targetView.classList.add('active-view');
            }
            
            // Close the sidebar if on mobile view
            if(window.innerWidth <= 768) {
                toggleSidebar();
            }

            // Update Top Header Title
            const pageTitleEl = document.getElementById('page-title');
            if (pageTitleEl) {
                // Get the text content of the tab, excluding the icon
                pageTitleEl.innerText = tab.innerText.trim();
            }

            if (targetId === 'map-view' && typeof myMap !== 'undefined') {
                setTimeout(() => myMap.invalidateSize(), 100);
            }
        });
    });
}

// Medication Image Mapper
function getMedicationImage(name, type, customUrl) {
    if (customUrl && customUrl.trim() !== '') return customUrl;
    
    if (!name) name = '';
    const nm = name.toLowerCase();
    
    if (nm.includes('سكر') || nm.includes('انسولين') || nm.includes('diabet') || nm.includes('insulin') || nm.includes('جلوكوفاج')) {
        return 'https://cdn.nahdi.sa/media/catalog/product/1/0/101416_1.jpg'; // Glucophage real photo
    }
    if (nm.includes('ضغط') || nm.includes('املوديبين') || nm.includes('كونكور') || nm.includes('blood pressure')) {
        return 'https://cdn.nahdi.sa/media/catalog/product/1/0/100085_1.jpg'; // Concor real photo
    }
    if (nm.includes('كوليسترول') || nm.includes('دهون') || nm.includes('ليبيتور') || nm.includes('cholesterol')) {
        return 'https://cdn.nahdi.sa/media/catalog/product/1/0/101897_1.jpg'; // Lipitor real photo
    }
    if (nm.includes('مسكن') || nm.includes('صداع') || nm.includes('الم') || nm.includes('بنادول') || nm.includes('panadol') || nm.includes('فيفادول')) {
        return 'https://cdn.nahdi.sa/media/catalog/product/1/0/102008_1_v1711202422.jpg'; // Panadol real photo
    }
    if (nm.includes('بروفين') || nm.includes('brufen')) {
        return 'https://cdn.nahdi.sa/media/catalog/product/1/0/101700_1.jpg'; // Brufen
    }
    if (nm.includes('ادفانس') || nm.includes('advance')) {
        return 'https://cdn.nahdi.sa/media/catalog/product/1/0/102008_1_v1711202422.jpg'; // Panadol Advance
    }
    if (nm.includes('فيتامين د') || nm.includes('vitamin d')) {
        return 'https://cdn.nahdi.sa/media/catalog/product/1/0/101347_1.jpg'; // Vitamin D
    }
    if (nm.includes('فيتامين') || nm.includes('حديد') || nm.includes('كالسيوم') || nm.includes('مكمل') || nm.includes('vitamin')) {
        return 'https://cdn.nahdi.sa/media/catalog/product/1/0/101869_1.jpg'; // Centrum Vitamin
    }
    if (nm.includes('مضاد') || nm.includes('اموكسيل') || nm.includes('اوجمنتين') || nm.includes('antibiotic')) {
        return 'https://cdn.nahdi.sa/media/catalog/product/1/0/101830_2.jpg'; // Augmentin
    }
    if (nm.includes('حساسية') || nm.includes('زيرتك') || nm.includes('allergy')) {
        return 'https://cdn.nahdi.sa/media/catalog/product/1/0/101183_1.jpg'; // Zyrtec
    }
    if (nm.includes('معده') || nm.includes('نيكسيوم') || nm.includes('nexium')) {
        return 'https://cdn.nahdi.sa/media/catalog/product/1/0/100863_1.jpg'; // Nexium
    }

    // Default Arabic Placeholder
    return "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect width='400' height='400' fill='%23f8fafc' rx='40'/%3E%3Cpath d='M200 100 A50 50 0 0 0 150 150 V300 A20 20 0 0 0 170 320 H230 A20 20 0 0 0 250 300 V150 A50 50 0 0 0 200 100 Z' fill='%23cbd5e1'/%3E%3Ctext x='200' y='360' font-family='Arial, sans-serif' font-size='24' fill='%2364748b' text-anchor='middle' font-weight='bold' direction='rtl'%3Eصورة غير متوفرة%3C/text%3E%3C/svg%3E";
}

// Render Medications List
function renderMedications() {
    medListEl.innerHTML = '';

    if (medications.length === 0) {
        medListEl.innerHTML = `
            <div style="text-align:center; padding: 40px 20px; color: var(--text-muted)">
                <i class="fa-solid fa-notes-medical fa-3x" style="color:#ddd; margin-bottom: 15px;"></i>
                <p>لا توجد أدوية مضافة لليوم.</p>
            </div>
        `;
        return;
    }

    // Sort by time
    const sortedMeds = [...medications].sort((a, b) => a.time.localeCompare(b.time));

    sortedMeds.forEach(med => {
        let imgSrc = getMedicationImage(med.name, med.type, med.image_url);

        const card = document.createElement('div');
        card.className = 'medication-card';
        card.innerHTML = `
            <div class="med-icon">
                <img src="${imgSrc}" alt="${med.name}">
            </div>
            <div class="med-info" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <div style="flex:1;">
                    <h3 style="font-size: 1.5rem; font-weight: 800; margin-bottom: 8px;">${med.name} <span style="font-size:1.1rem; font-weight:normal; color:#666">(${med.dose})</span></h3>
                    <div class="med-details" style="font-size: 1.1rem;">
                        <span><i class="fa-solid fa-circle-info" style="color:var(--primary-color);"></i> ${med.instruction}</span>
                    </div>
                </div>
                <button onclick="deleteMedication('${med.id}')" style="background: none; border: none; color: #ff6b6b; font-size: 1.4rem; cursor: pointer; padding: 10px;" title="حذف الدواء">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            <div class="med-time" style="font-size: 1.3rem; margin: 0 15px;">${med.time}</div>
            <div style="display: flex; align-items: center;">
                <button class="take-btn ${med.taken ? 'taken' : ''}" style="width: 55px; height: 55px; font-size: 1.8rem;" onclick="toggleTaken('${med.id}')" title="تم أخذه">
                    <i class="fa-solid ${med.taken ? 'fa-check' : 'fa-check'}"></i>
                </button>
            </div>
        `;
        medListEl.appendChild(card);
    });

    // Update stats whenever list is rendered
    updateAdherenceStats();
}

// Delete Medication
async function deleteMedication(id) {
    if (!confirm('هل أنت متأكد من حذف هذا الدواء؟')) return;

    // Delete associated reminders first to avoid foreign key errors
    await supabaseClient.from('reminders').delete().eq('medicine_id', id);

    // Delete the medicine
    const { error } = await supabaseClient
        .from('medicines')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting medication:', error);
        showNotification('خطأ', 'حدث خطأ أثناء الحذف');
        return;
    }

    await fetchMedications();
    renderMedications();
    showNotification('تم الحذف', 'تم حذف الدواء بنجاح');
}

// Update Adherence Stats
function updateAdherenceStats() {
    const total = medications.length;
    let takenCount = 0;
    let untakenCount = 0;

    medications.forEach(med => {
        if (med.taken) {
            takenCount++;
        } else {
            untakenCount++;
        }
    });

    const statTotalExp = document.getElementById('stat-total');
    const statTakenExp = document.getElementById('stat-taken');
    const statUntakenExp = document.getElementById('stat-untaken');
    const statAdherenceExp = document.getElementById('stat-adherence');

    if (statTotalExp) statTotalExp.innerText = total;
    if (statTakenExp) statTakenExp.innerText = takenCount;
    if (statUntakenExp) statUntakenExp.innerText = untakenCount;

    if (statAdherenceExp) {
        if (total === 0) {
            statAdherenceExp.innerText = '0%';
        } else {
            const percentage = Math.round((takenCount / total) * 100);
            statAdherenceExp.innerText = `${percentage}%`;
        }
    }
}

// Update Next Medication Widget
function updateNextMedication() {
    const nextMedTimeEl = document.getElementById('next-med-time');
    const nextMedNameEl = document.getElementById('next-med-name');
    
    if (!nextMedTimeEl || !nextMedNameEl) return;
    
    if (medications.length === 0) {
        nextMedTimeEl.innerText = '--:--';
        nextMedNameEl.innerText = 'لا يوجد أدوية في جدولك';
        return;
    }

    const now = new Date();
    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMinutes = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${currentHours}:${currentMinutes}`;

    // Filter medications that are AFTER current time AND not taken
    const upcomingMeds = medications.filter(med => med.time > currentTime && !med.taken);
    
    if (upcomingMeds.length > 0) {
        // Sort by time ascending
        upcomingMeds.sort((a, b) => a.time.localeCompare(b.time));
        const nextMed = upcomingMeds[0];
        
        // Convert to 12-hour format for display if desired, or keep as is
        nextMedTimeEl.innerText = nextMed.time;
        nextMedNameEl.innerText = nextMed.name;
    } else {
        // No more meds today
        nextMedTimeEl.innerText = '--:--';
        nextMedNameEl.innerText = 'لا يوجد جرعات قادمة اليوم';
    }
}

// Initialize Adherence Chart
let adherenceChartInstance = null;
function initAdherenceChart() {
    const ctx = document.getElementById('adherenceChart');
    if (!ctx) return;
    
    // Destroy previous instance if exists to prevent overlapping
    if (adherenceChartInstance) {
        adherenceChartInstance.destroy();
    }

    // Mock weekly data
    const labels = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const data = [60, 80, 100, 75, 50, 90, 100]; // نسبة الالتزام لكل يوم

    // Override today's data with actual live data if applicable
    const todayIndex = new Date().getDay(); // 0 is Sunday
    const total = medications.length;
    let todayAdherence = 0;
    if (total > 0) {
        const takenMeds = medications.filter(m => m.taken).length;
        todayAdherence = Math.round((takenMeds / total) * 100);
    }
    data[todayIndex] = todayAdherence;

    const isDark = document.body.classList.contains('dark-theme');
    const textColor = isDark ? '#e2e8f0' : '#2d3748';
    const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';

    adherenceChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'نسبة الالتزام %',
                data: data,
                borderColor: '#1a6fa8',
                backgroundColor: 'rgba(26, 111, 168, 0.2)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#4caf50',
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: gridColor },
                    ticks: { color: textColor, callback: function(value) { return value + '%' } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: textColor }
                }
            }
        }
    });
}

// Mark Medication as Taken
function toggleTaken(id) {
    const med = medications.find(m => m.id === id);
    if (med) {
        med.taken = !med.taken;
        
        updateAdherenceStats();
        updateNextMedication();
        if (adherenceChartInstance) initAdherenceChart(); // Update chart dot
        renderMedications();

        if (med.taken) {
            // Little feedback
            const btn = document.querySelector(`.take-btn.taken`);
            if (btn) {
                btn.style.transform = 'scale(1.1)';
                setTimeout(() => btn.style.transform = 'scale(1)', 200);
            }
        }
    }
}

// Add Medication Form Submit
addForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('med-name').value;
    const dose = document.getElementById('med-dose').value;
    const type = document.getElementById('med-type').value;
    const time = document.getElementById('med-time').value;
    const instruction = document.querySelector('input[name="instruction"]:checked').value;
    const imageUrl = document.getElementById('med-image-url') ? document.getElementById('med-image-url').value : null;

    // إضافة الدواء إلى قاعدة بيانات Supabase
    const { data, error } = await supabaseClient
        .from('medicines')
        .insert([
            { medicine_name: name, dosage: dose, time: time, type: type, instruction: instruction, user_id: currentUser.id, image_url: imageUrl }
        ])
        .select();

    if (error) {
        console.error('Error inserting medication:', error);
        showNotification('خطأ', 'حدث خطأ أثناء حفظ الدواء');
        return;
    }

    if (data && data.length > 0) {
        const medId = data[0].id;

        // إضافة تذكير للدواء الجديد في جدول التذكيرات
        await supabaseClient
            .from('reminders')
            .insert([
                { medicine_id: medId, reminder_time: time }
            ]);

        // تحديث القائمة بعد الإضافة
        await fetchMedications();
        renderMedications();

        // Switch to home tab
        document.querySelector('.tab-btn[data-target="home-view"]').click();

        // Reset form
        addForm.reset();

        // Show success notification
        showNotification('تمت الإضافة', `تم إضافة ${name} بنجاح إلى قاعدة البيانات`);
    }
});

// Drug Interaction Checker Simulator
function checkInteraction() {
    const d1 = document.getElementById('drug1').value.trim();
    const d2 = document.getElementById('drug2').value.trim();
    const resultBox = document.getElementById('interaction-result');

    if (!d1 || !d2) return;

    // Basic Simulation logic
    resultBox.classList.remove('hidden', 'result-safe', 'result-warning', 'result-danger');

    // Simulate loading
    resultBox.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الفحص...';
    resultBox.className = 'result-box';

    setTimeout(() => {
        const combo = (d1 + d2).toLowerCase();

        if (combo.includes('بنادول') && combo.includes('بروفين')) {
            resultBox.classList.add('result-warning');
            resultBox.innerHTML = '<strong><i class="fa-solid fa-triangle-exclamation"></i> تعارض متوسط:</strong> كلاهما مسكنات ألم، قد يزيدان من خطر التهاب المعدة. يفضل المباعدة بينهما.';
        } else if (combo.includes('اسبرين') && combo.includes('وارفارين')) {
            resultBox.classList.add('result-danger');
            resultBox.innerHTML = '<strong><i class="fa-solid fa-ban"></i> تعارض خطير:</strong> خطر النزيف عالي جداً! لا يجب الجمع بينهما إلا بإشراف طبي دقيق.';
        } else {
            resultBox.classList.add('result-safe');
            resultBox.innerHTML = '<strong><i class="fa-solid fa-check-circle"></i> آمن:</strong> لا توجد تفاعلات دوائية معروفة بين هذين الدواءين بناءً على قاعدة البيانات.';
        }
    }, 1000);
}

// Notification System
function showNotification(title, message) {
    const alert = document.getElementById('notification-alert');
    document.getElementById('alert-title').innerText = title;
    document.getElementById('alert-msg').innerText = message;

    alert.classList.add('show');

    // Auto hide after 5 seconds
    setTimeout(() => {
        closeNotification();
    }, 5000);
}

function closeNotification() {
    document.getElementById('notification-alert').classList.remove('show');
}

// Top Alert Banner Logic
let bannerTimeout;
window.showTopBannerAlert = function() {
    const banner = document.getElementById('med-alert-banner');
    if(banner) {
        // Force display block first to allow animation
        banner.style.display = 'flex';
        // Small delay to allow CSS transition to catch the display change
        setTimeout(() => {
            banner.classList.remove('hidden');
            banner.style.transform = 'translateY(0)';
            banner.style.opacity = '1';
        }, 10);
        
        // Play sound
        try {
            const audio = new Audio('https://actions.google.com/sounds/v1/alarms/spaceship_alarm.ogg');
            audio.play().catch(e => console.log('Audio play prevented by browser:', e));
        } catch (error) {
            console.error('Error playing sound:', error);
        }

        // Auto hide after 5 seconds
        clearTimeout(bannerTimeout);
        bannerTimeout = setTimeout(() => {
            window.closeBanner();
        }, 5000);
    }
}

window.closeBanner = function() {
    const banner = document.getElementById('med-alert-banner');
    if(banner) {
        banner.classList.add('hidden');
        banner.style.transform = 'translateY(-100%)';
        banner.style.opacity = '0';
        
        // Hide from DOM after transition finishes
        setTimeout(() => {
            banner.style.display = 'none';
        }, 500);
    }
}

// Medication Time Checker for Browser Notifications
function checkMedicationTimes() {
    if (medications.length === 0) return;

    const now = new Date();
    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMinutes = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${currentHours}:${currentMinutes}`;
    
    medications.forEach(med => {
        // إذا كان وقت الدواء يطابق الوقت الحالي ولم يتم أخذه مسبقاً في الدقائق الحالية
        if (med.time === currentTime && !med.notifiedAtThisMinute) {
            // mark it to prevent multiple alerts in the same minute
            med.notifiedAtThisMinute = true;
            
            triggerBrowserNotification('تذكير دوائي', 'حان وقت تناول دوائك الآن');
            // Show the top visual banner notification
            showTopBannerAlert();
        } else if (med.time !== currentTime) {
            // reset the flag when the minute passes
            med.notifiedAtThisMinute = false;
        }
    });
}

function triggerBrowserNotification(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, {
            body: body,
            icon: 'https://cdn-icons-png.flaticon.com/512/3063/3063076.png' // أيقونة دواء افتراضية
        });
        
        // إضافة صوت تنبيه بسيط
        try {
            const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
            audio.play().catch(e => console.log('Audio play prevented by browser:', e));
        } catch (error) {
            console.error('Error playing sound:', error);
        }
    }
}

async function logout() {
    await supabaseClient.auth.signOut();
    window.location.replace('login.html');
}

let myMap;
let currentUserLat = 24.7136;
let currentUserLng = 46.6753;
let currentMapMarkers = [];

function initMap() {
    myMap = L.map('map').setView([currentUserLat, currentUserLng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(myMap);

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            currentUserLat = position.coords.latitude;
            currentUserLng = position.coords.longitude;
            myMap.setView([currentUserLat, currentUserLng], 13);
            L.marker([currentUserLat, currentUserLng]).addTo(myMap).bindPopup('موقعك الحالي').openPopup();

            // تحديث قائمة الصيدليات بناءً على الإحداثيات الجديدة الحقيقية
            updatePharmaciesList(currentUserLat, currentUserLng);

        }, (err) => {
            console.error('Error getting location:', err);
            // Fallback (الرياض - افتراضي)
            updatePharmaciesList(currentUserLat, currentUserLng);
        });
    } else {
        updatePharmaciesList(currentUserLat, currentUserLng);
    }
    
    // إعداد مستمع البحث
    const searchInput = document.getElementById('pharmacy-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            updatePharmaciesList(currentUserLat, currentUserLng, e.target.value);
        });
    }
}

// قائمة افتراضية للصيدليات (بإحداثيات مبدئية سيتم حساب المسافة منها)
const pharmaciesDB = [
    { name: 'صيدلية النهدي', lat: 24.7236, lng: 46.6853, status: 'مفتوح', statusClass: 'success', stockMsg: 'الدواء متوفر', stockClass: 'text-success', stockIcon: 'fa-box-open' },
    { name: 'صيدلية الدواء', lat: 24.7000, lng: 46.6600, status: 'مفتوح', statusClass: 'success', stockMsg: 'الدواء متوفر', stockClass: 'text-success', stockIcon: 'fa-box-open' },
    { name: 'صيدلية المجتمع', lat: 24.7400, lng: 46.6900, status: 'مغلق قريباً', statusClass: 'warning', stockMsg: 'آخر قطعتين', stockClass: 'text-danger', stockIcon: 'fa-triangle-exclamation' },
    { name: 'صيدلية وايتس', lat: 24.6900, lng: 46.7000, status: 'مفتوح', statusClass: 'success', stockMsg: 'متوفر بكميات', stockClass: 'text-success', stockIcon: 'fa-box-open' },
    { name: 'صيدلية أورانج', lat: 24.7500, lng: 46.6500, status: 'مغلق', statusClass: 'danger', stockMsg: 'غير متوفر', stockClass: 'text-danger', stockIcon: 'fa-xmark' }
];

// دالة حساب المسافة بين نقطتين (Haversine formula)
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // نصف قطر الأرض بالكيلومتر
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; // المسافة بالكيلومتر
}

function deg2rad(deg) {
    return deg * (Math.PI/180);
}

function updatePharmaciesList(userLat, userLng, searchQuery = '') {
    const container = document.getElementById('pharmacies-list-container');
    if(!container) return;

    // Filter by search query if exists
    let filteredDB = pharmaciesDB;
    if (searchQuery.trim() !== '') {
        const lowerQ = searchQuery.toLowerCase();
        filteredDB = pharmaciesDB.filter(ph => 
            ph.name.toLowerCase().includes(lowerQ) || 
            ph.stockMsg.toLowerCase().includes(lowerQ)
        );
    }

    // 1. Calculate distance for each pharmacy
    const nearbyPharmacies = filteredDB.map(ph => {
        const dist = getDistanceFromLatLonInKm(userLat, userLng, ph.lat, ph.lng);
        return { ...ph, distanceKm: dist };
    });

    // 2. Sort by distance (الأقرب أولاً)
    nearbyPharmacies.sort((a, b) => a.distanceKm - b.distanceKm);

    // 3. Clear existing markers and add new to Map
    currentMapMarkers.forEach(m => myMap.removeLayer(m));
    currentMapMarkers = [];

    nearbyPharmacies.forEach(ph => {
        const marker = L.marker([ph.lat, ph.lng]).addTo(myMap).bindPopup(`<b>${ph.name}</b><br>تبعد ${ph.distanceKm.toFixed(1)} كم`);
        currentMapMarkers.push(marker);
    });

    // 4. Render HTML
    container.innerHTML = '';
    
    if (nearbyPharmacies.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding: 40px 20px; color: var(--text-muted)">
            <i class="fa-solid fa-search-minus fa-2x" style="color:#ddd; margin-bottom: 15px;"></i>
            <p>لا توجد نتائج مطابقة لبحثك</p>
        </div>`;
        return;
    }
    
    // إظهار أقرب 4 صيدليات فقط لتجنب الزحام
    nearbyPharmacies.slice(0, 4).forEach(ph => {
        const card = document.createElement('div');
        card.className = 'pharmacy-card list-item';
        card.innerHTML = `
            <div class="ph-info">
                <h4>${ph.name} <span class="badge ${ph.statusClass}">${ph.status}</span></h4>
                <p><i class="fa-solid fa-location-arrow"></i> تبعد ${ph.distanceKm.toFixed(1)} كم</p>
                <p class="stock-info ${ph.stockClass}"><i class="fa-solid ${ph.stockIcon}"></i> ${ph.stockMsg}</p>
            </div>
            <button class="icon-btn-secondary" onclick="openPharmacyRoute(${ph.lat}, ${ph.lng})"><i class="fa-solid fa-route"></i></button>
        `;
        container.appendChild(card);
    });
}

// Interactive Buttons Functions
function openModal(id) {
    const modal = document.getElementById(id);
    if(modal) {
        modal.classList.remove('hidden');
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if(modal) {
        modal.classList.add('hidden');
    }
}

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('dawaee-theme') || 'light';
    applyTheme(savedTheme);
}

function applyTheme(theme) {
    const themeSelect = document.getElementById('theme-select');
    const themeIcon = document.querySelector('#theme-toggle i');
    
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        if (themeSelect) themeSelect.value = 'dark';
        if (themeIcon) {
            themeIcon.classList.remove('fa-moon');
            themeIcon.classList.add('fa-sun');
        }
    } else {
        document.body.classList.remove('dark-theme');
        if (themeSelect) themeSelect.value = 'light';
        if (themeIcon) {
            themeIcon.classList.remove('fa-sun');
            themeIcon.classList.add('fa-moon');
        }
    }
    
    localStorage.setItem('dawaee-theme', theme);
    // Refresh chart colors if existing
    if (typeof adherenceChartInstance !== 'undefined' && adherenceChartInstance) {
        initAdherenceChart();
    }
}

// Called by the settings dropdown
window.toggleTheme = function(val) {
    applyTheme(val);
}

// Called by the header sun/moon button
window.toggleThemeButton = function() {
    const isDark = document.body.classList.contains('dark-theme');
    applyTheme(isDark ? 'light' : 'dark');
}

function openPharmacyRoute(lat, lng) {
    if(lat && lng) {
        alert(`سيتم تحويلك إلى خرائط جوجل للذهاب للموقع: ${lat}, ${lng}`);
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
    } else {
        alert('سيتم فتح تطبيق الخرائط الخاص بك لإرشادك إلى الصيدلية قريباً!');
    }
}

// EmailJS Contact Form Logic
function initEmailJS() {
    // ⚠️ تنبيه هام: يجب إدخال المفاتيح الخاصة بك من موقع EmailJS لكي يعمل الكود فعلياً
    const PUBLIC_KEY = 'YOUR_PUBLIC_KEY'; 
    const SERVICE_ID = 'YOUR_SERVICE_ID'; 
    const TEMPLATE_ID = 'YOUR_TEMPLATE_ID'; 

    if (typeof emailjs !== 'undefined') {
        emailjs.init(PUBLIC_KEY);
        
        const contactForm = document.getElementById('contact-form');
        if (contactForm) {
            contactForm.addEventListener('submit', function(event) {
                event.preventDefault();
                
                const btn = document.getElementById('contact-submit-btn');
                const btnText = btn.querySelector('span');
                const originalText = btnText.innerText;
                
                // Show loading state
                btnText.innerText = 'جاري الإرسال...';
                btn.disabled = true;

                // Send form
                emailjs.sendForm(SERVICE_ID, TEMPLATE_ID, this)
                    .then(() => {
                        alert('تم إرسال رسالتك بنجاح');
                        contactForm.reset();
                    })
                    .catch((error) => {
                        console.error('Email sending failed:', error);
                        alert('تعذر إرسال الرسالة، حاول مرة أخرى');
                    })
                    .finally(() => {
                        btnText.innerText = originalText;
                        btn.disabled = false;
                    });
            });
        }
    } else {
        console.error("EmailJS script not loaded.");
    }
}

function toggleTheme(themeVal) {
    if (themeVal === 'dark') {
        document.body.classList.add('dark-theme');
        localStorage.setItem('theme', 'dark');
    } else {
        document.body.classList.remove('dark-theme');
        localStorage.setItem('theme', 'light');
    }
}

// Mobile Sidebar Toggle
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (sidebar && overlay) {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }
}
