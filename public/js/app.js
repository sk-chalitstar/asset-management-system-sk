/**
 * app.js - ระบบบริหารจัดการทรัพย์สินและแจ้งซ่อมบำรุง
 * Enterprise Asset Management & Maintenance Ticket System
 * พัฒนาสำหรับ บริษัท ไอที โซลูชั่น แอนด์ เซอร์วิส จำกัด
 */

// Storage Keys
const STORAGE_KEYS = {
  USERS: 'ams_users_data',
  ASSETS: 'ams_assets_data',
  REPAIRS: 'ams_repairs_data',
  DEPARTMENTS: 'ams_departments_data',
  SETTINGS: 'ams_settings_data',
  CURRENT_USER: 'ams_current_user',
  GOOGLE_SHEET_URL: 'ams_google_sheet_url'
};

// Global App State
let appState = {
  currentUser: null,
  users: [],
  assets: [],
  repairs: [],
  departments: [],
  settings: {},
  googleSheetUrl: '',
  isCloudConnected: false,
  isSyncing: false,
  currentTab: 'dashboard',
  assetFilter: {
    search: '',
    department: 'all',
    category: 'all',
    status: 'all'
  },
  repairFilter: {
    search: '',
    status: 'all',
    department: 'all'
  },
  reportFilter: {
    periodType: 'month', // 'month', 'year', 'custom', 'all'
    month: (new Date().getMonth() + 1).toString().padStart(2, '0'),
    year: new Date().getFullYear().toString(),
    startDate: '',
    endDate: '',
    department: 'all',
    status: 'all'
  },
  charts: {},
  camera: {
    stream: null,
    targetInputId: null,
    targetPreviewId: null,
    facingMode: 'environment' // 'user' or 'environment'
  }
};

// =========================================================================
// 1. INITIALIZATION & DATA PERSISTENCE
// =========================================================================

function initDatabase() {
  const storedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
  appState.settings = storedSettings ? JSON.parse(storedSettings) : INITIAL_COMPANY_SETTINGS;
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(appState.settings));

  const storedDepts = localStorage.getItem(STORAGE_KEYS.DEPARTMENTS);
  appState.departments = storedDepts ? JSON.parse(storedDepts) : INITIAL_DEPARTMENTS;
  localStorage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(appState.departments));

  const storedUsers = localStorage.getItem(STORAGE_KEYS.USERS);
  appState.users = storedUsers ? JSON.parse(storedUsers) : INITIAL_USERS;
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(appState.users));

  const storedAssets = localStorage.getItem(STORAGE_KEYS.ASSETS);
  appState.assets = storedAssets ? JSON.parse(storedAssets) : INITIAL_ASSETS;
  localStorage.setItem(STORAGE_KEYS.ASSETS, JSON.stringify(appState.assets));

  const storedRepairs = localStorage.getItem(STORAGE_KEYS.REPAIRS);
  appState.repairs = storedRepairs ? JSON.parse(storedRepairs) : INITIAL_REPAIRS;
  localStorage.setItem(STORAGE_KEYS.REPAIRS, JSON.stringify(appState.repairs));

  const storedSession = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
  if (storedSession) {
    appState.currentUser = JSON.parse(storedSession);
  }

  // Load Google Sheet URL
  const storedUrl = localStorage.getItem(STORAGE_KEYS.GOOGLE_SHEET_URL);
  if (storedUrl) {
    appState.googleSheetUrl = storedUrl.trim();
    appState.isCloudConnected = true;
  }
}

// ---------------------------------------------------------------------------
// GOOGLE SHEETS CLOUD SYNC & BACKEND
// ---------------------------------------------------------------------------

async function syncWithGoogleSheet(showToast = true) {
  if (!appState.googleSheetUrl) return;

  appState.isSyncing = true;
  updateCloudStatusBadge();

  try {
    const res = await fetch(appState.googleSheetUrl + '?t=' + new Date().getTime(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    const json = await res.json();

    if (json.status === 'success' && json.data) {
      if (Array.isArray(json.data.assets) && json.data.assets.length > 0) {
        appState.assets = json.data.assets;
        saveData('assets');
      }
      if (Array.isArray(json.data.repairs)) {
        appState.repairs = json.data.repairs;
        saveData('repairs');
      }
      if (Array.isArray(json.data.departments) && json.data.departments.length > 0) {
        appState.departments = json.data.departments;
        saveData('departments');
      }
      if (Array.isArray(json.data.users) && json.data.users.length > 0) {
        appState.users = json.data.users;
        saveData('users');
      }
      if (json.data.settings) {
        appState.settings = Object.assign(appState.settings, json.data.settings);
        saveData('settings');
      }

      appState.isCloudConnected = true;
      populateDepartmentSelects();
      
      // Refresh current view
      if (appState.currentTab === 'dashboard') renderDashboard();
      if (appState.currentTab === 'assets') renderAssetsTable();
      if (appState.currentTab === 'repairs') renderRepairsTable();
      if (appState.currentTab === 'reports') generateRepairReport();

      if (showToast) {
        Swal.fire({
          icon: 'success',
          title: 'ซิงค์ข้อมูลสำเร็จ',
          text: 'ดึงข้อมูลล่าสุดจาก Google Sheets เรียบร้อยแล้ว',
          timer: 1500,
          showConfirmButton: false
        });
      }
    }
  } catch (err) {
    console.warn('Google Sheets sync warning:', err);
    if (showToast) {
      Swal.fire({
        icon: 'warning',
        title: 'เชื่อมต่อ Google Sheets ไม่สำเร็จ',
        text: 'ไม่สามารถดึงข้อมูลได้ ระบบจะใช้ข้อมูลในเครื่อง (LocalStorage) แทน: ' + err.message
      });
    }
  } finally {
    appState.isSyncing = false;
    updateCloudStatusBadge();
  }
}

async function sendToCloud(action, payload) {
  if (!appState.googleSheetUrl) return;

  try {
    // Send using text/plain to avoid CORS preflight options
    await fetch(appState.googleSheetUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({ action, payload })
    });
  } catch (err) {
    console.warn('Background Cloud Sync error:', err);
  }
}

function openGoogleSheetSettingsModal() {
  document.getElementById('googleSheetUrlInput').value = appState.googleSheetUrl || '';
  document.getElementById('googleSheetModal').classList.remove('hidden');
}

function closeGoogleSheetSettingsModal() {
  document.getElementById('googleSheetModal').classList.add('hidden');
}

async function saveGoogleSheetUrl() {
  const url = document.getElementById('googleSheetUrlInput').value.trim();
  if (!url) {
    Swal.fire({
      title: 'ลบการเชื่อมต่อ Google Sheets?',
      text: 'ระบบจะกลับไปทำงานในโหมดจัดเก็บในเครื่อง (LocalStorage)',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'ใช่, ตัดการเชื่อมต่อ',
      cancelButtonText: 'ยกเลิก'
    }).then(result => {
      if (result.isConfirmed) {
        appState.googleSheetUrl = '';
        appState.isCloudConnected = false;
        localStorage.removeItem(STORAGE_KEYS.GOOGLE_SHEET_URL);
        updateCloudStatusBadge();
        closeGoogleSheetSettingsModal();
        Swal.fire('สำเร็จ', 'ตัดการเชื่อมต่อแล้ว', 'success');
      }
    });
    return;
  }

  if (!url.startsWith('https://script.google.com/macros/s/')) {
    Swal.fire('URL ไม่ถูกต้อง', 'URL ของ Google Apps Script ต้องขึ้นต้นด้วย https://script.google.com/macros/s/.../exec', 'warning');
    return;
  }

  appState.googleSheetUrl = url;
  localStorage.setItem(STORAGE_KEYS.GOOGLE_SHEET_URL, url);
  appState.isCloudConnected = true;
  updateCloudStatusBadge();

  closeGoogleSheetSettingsModal();

  Swal.fire({
    title: 'กำลังเชื่อมต่อและดึงข้อมูล...',
    text: 'กรุณารอสักครู่',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
      syncWithGoogleSheet(true);
    }
  });
}

// Bulk Upload Initial Data to Google Sheet
function uploadAllToGoogleSheet() {
  const inputVal = document.getElementById('googleSheetUrlInput')?.value.trim();
  const url = inputVal || appState.googleSheetUrl;

  if (!url) {
    Swal.fire({
      icon: 'warning',
      title: 'แจ้งเตือน',
      text: 'กรุณานำ Web App URL ที่ได้จาก Google Apps Script มาวางในช่อง "Google Apps Script Web App URL:" ด้านบนก่อนครับ'
    });
    return;
  }

  // Auto save URL if not yet saved
  appState.googleSheetUrl = url;
  localStorage.setItem(STORAGE_KEYS.GOOGLE_SHEET_URL, url);
  appState.isCloudConnected = true;
  updateCloudStatusBadge();

  Swal.fire({
    title: 'ส่งข้อมูลขึ้น Google Sheets?',
    text: `ระบบจะส่งทรัพย์สินทั้งหมด (${appState.assets.length} เครื่อง), ประวัติงานซ่อม, แผนก, และผู้ใช้ ขึ้นไปบันทึกบน Google Sheets ของคุณ`,
    icon: 'info',
    showCancelButton: true,
    confirmButtonText: 'ยืนยันส่งข้อมูล',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#2563eb'
  }).then(async (result) => {
    if (result.isConfirmed) {
      Swal.fire({
        title: 'กำลังส่งข้อมูลขึ้น Google Sheets...',
        text: 'กรุณารอสักครู่ ประมาณ 3-5 วินาที',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      try {
        await sendToCloud('seedDatabase', {
          assets: appState.assets,
          repairs: appState.repairs,
          users: appState.users,
          departments: appState.departments,
          settings: appState.settings
        });

        setTimeout(() => {
          Swal.fire({
            icon: 'success',
            title: 'ส่งข้อมูลขึ้น Google Sheets เรียบร้อยแล้ว!',
            text: 'เปิดดูในไฟล์ Google Sheets ของคุณได้ทันทีครับ',
            confirmButtonText: 'ตกลง'
          });
        }, 1500);

      } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
      }
    }
  });
}

function updateCloudStatusBadge() {
  const badge = document.getElementById('headerCloudBadge');
  if (!badge) return;

  if (appState.isSyncing) {
    badge.className = 'px-2.5 py-1.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold flex items-center gap-1.5 transition';
    badge.innerHTML = `<i class="fa-solid fa-rotate fa-spin text-amber-600"></i> <span class="hidden sm:inline">กำลังซิงค์...</span>`;
  } else if (appState.isCloudConnected && appState.googleSheetUrl) {
    badge.className = 'px-2.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer';
    badge.innerHTML = `<i class="fa-solid fa-cloud text-emerald-600"></i> <span class="hidden sm:inline">Google Sheets:</span> ออนไลน์`;
  } else {
    badge.className = 'px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-600 border border-slate-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer';
    badge.innerHTML = `<i class="fa-solid fa-link text-slate-400"></i> <span class="hidden sm:inline">เชื่อมต่อ</span> Sheets`;
  }
}

function saveData(key) {
  if (key === 'assets' || !key) localStorage.setItem(STORAGE_KEYS.ASSETS, JSON.stringify(appState.assets));
  if (key === 'repairs' || !key) localStorage.setItem(STORAGE_KEYS.REPAIRS, JSON.stringify(appState.repairs));
  if (key === 'users' || !key) localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(appState.users));
  if (key === 'departments' || !key) localStorage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(appState.departments));
  if (key === 'settings' || !key) localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(appState.settings));
}

function resetToExcelData() {
  Swal.fire({
    title: 'รีเซ็ตข้อมูลทั้งหมด?',
    text: 'ระบบจะคืนค่าข้อมูลทรัพย์สิน, ผู้ใช้, แผนก, และประวัติการแจ้งซ่อมกลับเป็นข้อมูลตามไฟล์ Excel เริ่มต้น',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ใช่, รีเซ็ตข้อมูล',
    cancelButtonText: 'ยกเลิก'
  }).then((result) => {
    if (result.isConfirmed) {
      localStorage.removeItem(STORAGE_KEYS.ASSETS);
      localStorage.removeItem(STORAGE_KEYS.REPAIRS);
      localStorage.removeItem(STORAGE_KEYS.USERS);
      localStorage.removeItem(STORAGE_KEYS.DEPARTMENTS);
      localStorage.removeItem(STORAGE_KEYS.SETTINGS);
      initDatabase();
      renderApp();
      Swal.fire('สำเร็จ', 'รีเซ็ตข้อมูลตามไฟล์ Excel เรียบร้อยแล้ว', 'success');
    }
  });
}

// =========================================================================
// 2. AUTHENTICATION & SESSION
// =========================================================================

function handleLoginSubmit(event) {
  event.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();

  const user = appState.users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);

  if (user) {
    if (user.status !== 'active') {
      Swal.fire('เกิดข้อผิดพลาด', 'บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแลระบบ', 'error');
      return;
    }

    appState.currentUser = user;
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    
    document.getElementById('loginScreen').classList.add('hidden');
    renderApp();

    Swal.fire({
      icon: 'success',
      title: 'ยินดีต้อนรับ',
      text: `${user.fullName} (${getRoleBadgeText(user.role)})`,
      timer: 1600,
      showConfirmButton: false
    });
  } else {
    Swal.fire({
      icon: 'error',
      title: 'เข้าสู่ระบบไม่สำเร็จ',
      text: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง'
    });
  }
}

function quickLogin(username, password) {
  document.getElementById('loginUsername').value = username;
  document.getElementById('loginPassword').value = password;
  document.getElementById('loginForm').dispatchEvent(new Event('submit'));
}

function handleLogout() {
  Swal.fire({
    title: 'ออกจากระบบ?',
    text: 'คุณต้องการออกจากระบบการทำงานใช่หรือไม่',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#2563eb',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ออกจากระบบ',
    cancelButtonText: 'ยกเลิก'
  }).then((result) => {
    if (result.isConfirmed) {
      appState.currentUser = null;
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      document.getElementById('loginScreen').classList.remove('hidden');
      document.getElementById('loginUsername').value = '';
      document.getElementById('loginPassword').value = '';
    }
  });
}

function getRoleBadgeText(role) {
  switch (role) {
    case 'admin': return 'ผู้ดูแลระบบสูงสุด (Admin)';
    case 'technician': return 'ช่างเทคนิค/IT (Technician)';
    default: return 'พนักงาน/ผู้แจ้ง (User)';
  }
}

// =========================================================================
// 3. CAMERA CAPTURE & IMAGE COMPRESSION (กดถ่ายรูป & อัปโหลด)
// =========================================================================

// Compress image to max 800x800 JPEG 0.75 quality to prevent localStorage quota issues
function compressImage(fileOrBlob, callback) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const maxDim = 800;
      let width = img.width;
      let height = img.height;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.75);
      callback(compressedDataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(fileOrBlob);
}

// Handle Direct File Upload (or Native Camera on Mobile)
function handleImageFileInput(event, targetInputId, targetPreviewId) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    Swal.fire('ข้อผิดพลาด', 'กรุณาเลือกไฟล์รูปภาพเท่านั้น', 'warning');
    return;
  }

  compressImage(file, (dataUrl) => {
    document.getElementById(targetInputId).value = dataUrl;
    renderImagePreview(targetPreviewId, targetInputId, dataUrl);
  });
}

function renderImagePreview(previewContainerId, inputId, dataUrl) {
  const container = document.getElementById(previewContainerId);
  if (!container) return;

  if (dataUrl) {
    container.innerHTML = `
      <div class="relative inline-block mt-2">
        <img src="${dataUrl}" class="w-32 h-32 object-cover rounded-2xl border-2 border-blue-500 shadow-md">
        <button type="button" onclick="removeImage('${inputId}', '${previewContainerId}')" title="ลบรูปภาพ" class="absolute -top-2 -right-2 w-7 h-7 bg-rose-600 hover:bg-rose-700 text-white rounded-full flex items-center justify-center shadow-lg transition">
          <i class="fa-solid fa-xmark text-xs"></i>
        </button>
      </div>
    `;
  } else {
    container.innerHTML = '';
  }
}

function removeImage(inputId, previewContainerId) {
  document.getElementById(inputId).value = '';
  const container = document.getElementById(previewContainerId);
  if (container) container.innerHTML = '';
}

// Web Browser Live Camera Modal
async function openCameraModal(targetInputId, targetPreviewId) {
  appState.camera.targetInputId = targetInputId;
  appState.camera.targetPreviewId = targetPreviewId;

  const modal = document.getElementById('cameraModal');
  modal.classList.remove('hidden');

  await startCameraStream();
}

async function startCameraStream() {
  const video = document.getElementById('cameraVideo');
  if (appState.camera.stream) {
    appState.camera.stream.getTracks().forEach(track => track.stop());
  }

  try {
    const constraints = {
      video: {
        facingMode: appState.camera.facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    appState.camera.stream = stream;
    video.srcObject = stream;
    video.play();
  } catch (err) {
    console.error('Camera access error:', err);
    Swal.fire({
      icon: 'error',
      title: 'ไม่สามารถเปิดกล้องได้',
      text: 'กรุณาอนุญาตสิทธิ์การเข้าถึงกล้อง (Camera Permission) ในเบราว์เซอร์ หรือใช้วิธีเลือกรูปจากเครื่อง'
    });
    closeCameraModal();
  }
}

function switchCameraFacingMode() {
  appState.camera.facingMode = appState.camera.facingMode === 'user' ? 'environment' : 'user';
  startCameraStream();
}

function captureCameraSnapshot() {
  const video = document.getElementById('cameraVideo');
  if (!video || !appState.camera.stream) return;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');

  // If user facing, mirror image
  if (appState.camera.facingMode === 'user') {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob((blob) => {
    compressImage(blob, (dataUrl) => {
      if (appState.camera.targetInputId) {
        document.getElementById(appState.camera.targetInputId).value = dataUrl;
      }
      if (appState.camera.targetPreviewId) {
        renderImagePreview(appState.camera.targetPreviewId, appState.camera.targetInputId, dataUrl);
      }
      closeCameraModal();

      Swal.fire({
        icon: 'success',
        title: 'ถ่ายภาพเรียบร้อย',
        timer: 1200,
        showConfirmButton: false
      });
    });
  }, 'image/jpeg', 0.85);
}

function closeCameraModal() {
  if (appState.camera.stream) {
    appState.camera.stream.getTracks().forEach(track => track.stop());
    appState.camera.stream = null;
  }
  document.getElementById('cameraModal').classList.add('hidden');
}

// =========================================================================
// 4. NAVIGATION & UI RENDERING
// =========================================================================

function switchTab(tabName) {
  appState.currentTab = tabName;

  document.querySelectorAll('.nav-link').forEach(btn => {
    if (btn.dataset.tab === tabName) {
      btn.classList.add('bg-blue-50', 'text-blue-600', 'font-semibold');
      btn.classList.remove('text-slate-600', 'hover:bg-slate-50');
    } else {
      btn.classList.remove('bg-blue-50', 'text-blue-600', 'font-semibold');
      btn.classList.add('text-slate-600', 'hover:bg-slate-50');
    }
  });

  const tabs = ['dashboard', 'assets', 'repairs', 'departments', 'users', 'reports'];
  tabs.forEach(t => {
    const el = document.getElementById(`view-${t}`);
    if (el) {
      if (t === tabName) {
        el.classList.remove('hidden');
        el.classList.add('fade-in');
      } else {
        el.classList.add('hidden');
        el.classList.remove('fade-in');
      }
    }
  });

  if (tabName === 'dashboard') renderDashboard();
  if (tabName === 'assets') renderAssetsTable();
  if (tabName === 'repairs') renderRepairsTable();
  if (tabName === 'departments') renderDepartmentsTable();
  if (tabName === 'users') renderUsersTable();
  if (tabName === 'reports') renderReportsView();
}

function renderApp() {
  if (!appState.currentUser) {
    document.getElementById('loginScreen').classList.remove('hidden');
    return;
  }

  const user = appState.currentUser;
  const userNameEl = document.getElementById('headerUserName');
  const userRoleEl = document.getElementById('headerUserRole');
  const userDeptEl = document.getElementById('headerUserDept');

  if (userNameEl) userNameEl.textContent = user.fullName;
  if (userRoleEl) userRoleEl.textContent = getRoleBadgeText(user.role);
  if (userDeptEl) userDeptEl.textContent = user.department || 'ไม่ระบุ';

  const userNav = document.querySelector('[data-tab="users"]');
  if (userNav) {
    if (user.role === 'admin') userNav.classList.remove('hidden');
    else userNav.classList.add('hidden');
  }

  populateDepartmentSelects();
  updateCloudStatusBadge();
  switchTab(appState.currentTab || 'dashboard');
}

function populateDepartmentSelects() {
  const depts = appState.departments;

  const filterDept = document.getElementById('assetFilterDept');
  if (filterDept) {
    filterDept.innerHTML = `<option value="all">ทุกแผนก (${appState.assets.length} ชิ้น)</option>` +
      depts.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
  }

  const repairFilterDept = document.getElementById('repairFilterDept');
  if (repairFilterDept) {
    repairFilterDept.innerHTML = `<option value="all">ทุกแผนก</option>` +
      depts.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
  }

  const reportFilterDept = document.getElementById('reportFilterDept');
  if (reportFilterDept) {
    reportFilterDept.innerHTML = `<option value="all">-- ทุกแผนก --</option>` +
      depts.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
  }

  const assetModalDept = document.getElementById('assetModalDept');
  if (assetModalDept) {
    assetModalDept.innerHTML = `<option value="">-- เลือกแผนก --</option>` +
      depts.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
  }

  const repairModalDept = document.getElementById('repairModalDept');
  if (repairModalDept) {
    repairModalDept.innerHTML = `<option value="">-- เลือกแผนก --</option>` +
      depts.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
  }

  const userModalDept = document.getElementById('userModalDept');
  if (userModalDept) {
    userModalDept.innerHTML = `<option value="">-- เลือกแผนก --</option>` +
      depts.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
  }
}

// =========================================================================
// 5. DASHBOARD & ANALYTICS
// =========================================================================

function renderDashboard() {
  const assets = appState.assets;
  const repairs = appState.repairs;

  const totalAssets = assets.length;
  const normalAssets = assets.filter(a => a.status === 'ใช้งานได้ปกติ').length;
  const repairAssets = assets.filter(a => a.status === 'ส่งซ่อม').length;
  const backupAssets = assets.filter(a => a.status === 'สำรอง').length;
  const retiredAssets = assets.filter(a => a.status === 'ปลดระวาง/ชำรุด').length;

  const totalRepairs = repairs.length;
  const pendingRepairs = repairs.filter(r => r.status === 'รอดำเนินการ').length;
  const completedRepairs = repairs.filter(r => r.status === 'ซ่อมเสร็จสิ้น').length;

  const totalValue = assets.reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0);

  document.getElementById('statTotalAssets').textContent = totalAssets.toLocaleString();
  document.getElementById('statNormalAssets').textContent = normalAssets.toLocaleString();
  document.getElementById('statRepairAssets').textContent = repairAssets.toLocaleString();
  document.getElementById('statBackupAssets').textContent = backupAssets.toLocaleString();
  document.getElementById('statRetiredAssets').textContent = retiredAssets.toLocaleString();

  document.getElementById('statTotalRepairs').textContent = totalRepairs.toLocaleString();
  document.getElementById('statPendingRepairs').textContent = pendingRepairs.toLocaleString();
  document.getElementById('statCompletedRepairs').textContent = completedRepairs.toLocaleString();
  document.getElementById('statTotalValue').textContent = totalValue.toLocaleString('th-TH', { style: 'currency', currency: 'THB' });

  renderDashboardCharts();
  renderRecentRepairsList();
}

function renderDashboardCharts() {
  const assets = appState.assets;

  const catCounts = {};
  assets.forEach(a => {
    const cat = a.category || 'อื่นๆ';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  });

  const ctxCategory = document.getElementById('chartCategory');
  if (ctxCategory) {
    if (appState.charts.category) appState.charts.category.destroy();
    appState.charts.category = new Chart(ctxCategory, {
      type: 'doughnut',
      data: {
        labels: Object.keys(catCounts),
        datasets: [{
          data: Object.values(catCounts),
          backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { family: 'Prompt', size: 11 } } }
        }
      }
    });
  }

  const statusCounts = {
    'ใช้งานได้ปกติ': assets.filter(a => a.status === 'ใช้งานได้ปกติ').length,
    'สำรอง': assets.filter(a => a.status === 'สำรอง').length,
    'ส่งซ่อม': assets.filter(a => a.status === 'ส่งซ่อม').length,
    'ปลดระวาง/ชำรุด': assets.filter(a => a.status === 'ปลดระวาง/ชำรุด').length
  };

  const ctxStatus = document.getElementById('chartStatus');
  if (ctxStatus) {
    if (appState.charts.status) appState.charts.status.destroy();
    appState.charts.status = new Chart(ctxStatus, {
      type: 'pie',
      data: {
        labels: Object.keys(statusCounts),
        datasets: [{
          data: Object.values(statusCounts),
          backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { family: 'Prompt', size: 11 } } }
        }
      }
    });
  }

  const deptCounts = {};
  assets.forEach(a => {
    const dept = a.department || 'ไม่ระบุแผนก';
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  });

  const sortedDepts = Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const ctxDept = document.getElementById('chartDepartment');
  if (ctxDept) {
    if (appState.charts.department) appState.charts.department.destroy();
    appState.charts.department = new Chart(ctxDept, {
      type: 'bar',
      data: {
        labels: sortedDepts.map(d => d[0]),
        datasets: [{
          label: 'จำนวนทรัพย์สิน (เครื่อง)',
          data: sortedDepts.map(d => d[1]),
          backgroundColor: '#3b82f6',
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0, font: { family: 'Prompt' } } },
          x: { ticks: { font: { family: 'Prompt', size: 11 } } }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }
}

function renderRecentRepairsList() {
  const recentRepairs = [...appState.repairs].reverse().slice(0, 5);
  const container = document.getElementById('recentRepairsContainer');
  if (!container) return;

  if (recentRepairs.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-slate-400 text-sm">ยังไม่มีรายการแจ้งซ่อม</div>`;
    return;
  }

  container.innerHTML = recentRepairs.map(rep => `
    <div class="p-3 sm:p-4 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition">
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-xl ${getRepairIconBg(rep.status)} flex items-center justify-center shrink-0 mt-0.5">
          <i class="${getRepairIcon(rep.status)} text-base"></i>
        </div>
        <div>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-bold text-slate-800 text-sm">${rep.repairCode}</span>
            <span class="px-2 py-0.5 rounded-full text-[11px] font-medium ${getRepairStatusBadgeClass(rep.status)}">${rep.status}</span>
            <span class="text-xs text-slate-400"><i class="fa-regular fa-calendar mr-1"></i>${rep.requestDate || '-'}</span>
          </div>
          <p class="text-xs font-medium text-slate-700 mt-1">${rep.problemTitle}</p>
          <p class="text-[11px] text-slate-500">รหัสทรัพย์สิน: <span class="font-semibold text-blue-600">${rep.assetCode}</span> (${rep.assetName}) • แผนก: ${rep.department}</p>
        </div>
      </div>
      <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
        <button onclick="openRepairDetailsModal('${rep.id}')" class="px-3 py-1.5 bg-white border border-slate-200 hover:border-blue-500 hover:text-blue-600 text-slate-700 rounded-xl text-xs font-medium transition shadow-sm">
          <i class="fa-solid fa-eye mr-1"></i> ดูรายละเอียด
        </button>
      </div>
    </div>
  `).join('');
}

// =========================================================================
// 6. ASSET MANAGEMENT
// =========================================================================

function handleAssetSearch(val) {
  appState.assetFilter.search = val.toLowerCase().trim();
  renderAssetsTable();
}

function handleAssetFilterDept(dept) {
  appState.assetFilter.department = dept;
  renderAssetsTable();
}

function handleAssetFilterCategory(cat) {
  appState.assetFilter.category = cat;
  renderAssetsTable();
}

function handleAssetFilterStatus(st) {
  appState.assetFilter.status = st;
  renderAssetsTable();
}

function getFilteredAssets() {
  const { search, department, category, status } = appState.assetFilter;
  return appState.assets.filter(a => {
    if (department !== 'all' && a.department !== department) return false;
    if (category !== 'all' && a.category !== category) return false;
    if (status !== 'all' && a.status !== status) return false;
    if (search) {
      const matchCode = (a.assetCode || '').toLowerCase().includes(search);
      const matchName = (a.name || '').toLowerCase().includes(search);
      const matchBrand = (a.brand || '').toLowerCase().includes(search);
      const matchModel = (a.model || '').toLowerCase().includes(search);
      const matchSerial = (a.serialNumber || '').toLowerCase().includes(search);
      const matchUser = (a.assignedUser || '').toLowerCase().includes(search);
      const matchLoc = (a.location || '').toLowerCase().includes(search);
      if (!matchCode && !matchName && !matchBrand && !matchModel && !matchSerial && !matchUser && !matchLoc) {
        return false;
      }
    }
    return true;
  });
}

function renderAssetsTable() {
  const list = getFilteredAssets();
  const tbody = document.getElementById('assetsTableBody');
  const countBadge = document.getElementById('filteredAssetCount');
  
  if (countBadge) countBadge.textContent = `${list.length} / ${appState.assets.length} รายการ`;
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-12 text-slate-400">
          <i class="fa-solid fa-box-open text-4xl mb-2 opacity-50 block"></i>
          ไม่พบข้อมูลทรัพย์สินที่ตรงกับเงื่อนไขการค้นหา
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map((a, idx) => {
    const imagePreview = a.imageUrl 
      ? `<img src="${a.imageUrl}" alt="${a.name}" class="w-10 h-10 object-cover rounded-xl border border-slate-200 bg-slate-100" onerror="this.onerror=null;this.src='https://placehold.co/100x100?text=IT';">`
      : `<div class="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400"><i class="${getCategoryIcon(a.category)}"></i></div>`;

    return `
      <tr class="hover:bg-blue-50/40 border-b border-slate-100 transition text-xs sm:text-sm">
        <td class="py-3 px-3 text-center text-slate-400 font-mono text-xs">${idx + 1}</td>
        <td class="py-3 px-3">
          <div class="flex items-center gap-3">
            ${imagePreview}
            <div>
              <div class="font-bold text-slate-900">${a.assetCode || 'ไม่มีรหัส'}</div>
              <div class="text-[11px] text-slate-500 font-mono">${a.id}</div>
            </div>
          </div>
        </td>
        <td class="py-3 px-3">
          <div class="font-semibold text-slate-800">${a.name}</div>
          <div class="text-xs text-slate-500">${a.brand || '-'} ${a.model ? '• ' + a.model : ''}</div>
          ${a.serialNumber ? `<div class="text-[11px] text-slate-400 font-mono">S/N: ${a.serialNumber}</div>` : ''}
        </td>
        <td class="py-3 px-3">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium">
            <i class="${getCategoryIcon(a.category)} text-blue-600"></i> ${a.category || '-'}
          </span>
        </td>
        <td class="py-3 px-3">
          <div class="font-medium text-slate-800">${a.department || '-'}</div>
          <div class="text-xs text-slate-400"><i class="fa-solid fa-location-dot mr-1"></i>${a.location || 'ไม่ระบุสถานที่'}</div>
        </td>
        <td class="py-3 px-3">
          <div class="text-xs font-medium text-slate-700">${a.assignedUser || '<span class="text-slate-400">ยังไม่ระบุ</span>'}</div>
        </td>
        <td class="py-3 px-3 text-center">
          <span class="px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusBadgeClass(a.status)}">
            ${a.status}
          </span>
        </td>
        <td class="py-3 px-3 text-right">
          <div class="flex items-center justify-end gap-1.5">
            <button onclick="viewAssetDetails('${a.id}')" title="ดูข้อมูลและประวัติ" class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-blue-100 hover:text-blue-600 text-slate-600 transition flex items-center justify-center">
              <i class="fa-solid fa-eye text-xs"></i>
            </button>
            <button onclick="printAssetCard('${a.id}')" title="พิมพ์บัตรประวัติทรัพย์สิน (IT Asset Card)" class="w-8 h-8 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition flex items-center justify-center">
              <i class="fa-solid fa-print text-xs"></i>
            </button>
            <button onclick="openPrintLabelModal('${a.id}')" title="พิมพ์ QR Code / ป้ายทรัพย์สิน" class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-purple-100 hover:text-purple-600 text-slate-600 transition flex items-center justify-center">
              <i class="fa-solid fa-qrcode text-xs"></i>
            </button>
            <button onclick="openReportRepairFromAsset('${a.id}')" title="แจ้งซ่อมทรัพย์สินนี้" class="w-8 h-8 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-600 transition flex items-center justify-center">
              <i class="fa-solid fa-wrench text-xs"></i>
            </button>
            ${appState.currentUser && appState.currentUser.role === 'admin' ? `
              <button onclick="openEditAssetModal('${a.id}')" title="แก้ไขข้อมูล" class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-emerald-100 hover:text-emerald-600 text-slate-600 transition flex items-center justify-center">
                <i class="fa-solid fa-pen text-xs"></i>
              </button>
              <button onclick="deleteAsset('${a.id}')" title="ลบทรัพย์สิน" class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-rose-100 hover:text-rose-600 text-slate-600 transition flex items-center justify-center">
                <i class="fa-solid fa-trash-can text-xs"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'ใช้งานได้ปกติ': return 'badge-status-normal';
    case 'ส่งซ่อม': return 'badge-status-repair';
    case 'ปลดระวาง/ชำรุด': return 'badge-status-retired';
    case 'สำรอง': return 'badge-status-backup';
    default: return 'bg-slate-100 text-slate-600';
  }
}

function getCategoryIcon(cat) {
  switch (cat) {
    case 'Desktop PC': return 'fa-solid fa-desktop';
    case 'Notebook': return 'fa-solid fa-laptop';
    case 'Printer': return 'fa-solid fa-print';
    case 'Server': return 'fa-solid fa-server';
    default: return 'fa-solid fa-microchip';
  }
}

function openAddAssetModal() {
  document.getElementById('assetModalTitle').textContent = 'เพิ่มทรัพย์สินใหม่ (New Asset)';
  document.getElementById('assetModalId').value = '';
  document.getElementById('assetModalForm').reset();
  removeImage('assetModalImageUrl', 'assetModalImagePreview');
  
  const now = new Date();
  const dateStr = now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  document.getElementById('assetModalGeneratedId').value = `AST${dateStr}`;
  document.getElementById('assetModalStatus').value = 'ใช้งานได้ปกติ';

  document.getElementById('assetModal').classList.remove('hidden');
}

function openEditAssetModal(id) {
  const asset = appState.assets.find(a => a.id === id);
  if (!asset) return;

  document.getElementById('assetModalTitle').textContent = `แก้ไขข้อมูลทรัพย์สิน: ${asset.assetCode}`;
  document.getElementById('assetModalId').value = asset.id;
  document.getElementById('assetModalGeneratedId').value = asset.id;
  document.getElementById('assetModalCode').value = asset.assetCode || '';
  document.getElementById('assetModalName').value = asset.name || '';
  document.getElementById('assetModalCategory').value = asset.category || 'Desktop PC';
  document.getElementById('assetModalBrand').value = asset.brand || '';
  document.getElementById('assetModalModel').value = asset.model || '';
  document.getElementById('assetModalSerial').value = asset.serialNumber || '';
  document.getElementById('assetModalDept').value = asset.department || '';
  document.getElementById('assetModalLocation').value = asset.location || '';
  document.getElementById('assetModalAssignedUser').value = asset.assignedUser || '';
  document.getElementById('assetModalPrice').value = asset.price || 0;
  document.getElementById('assetModalPurchaseDate').value = asset.purchaseDate || '';
  document.getElementById('assetModalStatus').value = asset.status || 'ใช้งานได้ปกติ';
  document.getElementById('assetModalImageUrl').value = asset.imageUrl || '';
  document.getElementById('assetModalNotes').value = asset.notes || '';

  renderImagePreview('assetModalImagePreview', 'assetModalImageUrl', asset.imageUrl);

  document.getElementById('assetModal').classList.remove('hidden');
}

function closeAssetModal() {
  document.getElementById('assetModal').classList.add('hidden');
}

function handleAssetFormSubmit(event) {
  event.preventDefault();
  const editId = document.getElementById('assetModalId').value;
  const isEdit = !!editId;

  const assetData = {
    id: isEdit ? editId : document.getElementById('assetModalGeneratedId').value,
    assetCode: document.getElementById('assetModalCode').value.trim(),
    name: document.getElementById('assetModalName').value.trim(),
    category: document.getElementById('assetModalCategory').value,
    brand: document.getElementById('assetModalBrand').value.trim(),
    model: document.getElementById('assetModalModel').value.trim(),
    serialNumber: document.getElementById('assetModalSerial').value.trim(),
    department: document.getElementById('assetModalDept').value,
    location: document.getElementById('assetModalLocation').value.trim(),
    assignedUser: document.getElementById('assetModalAssignedUser').value.trim(),
    price: parseFloat(document.getElementById('assetModalPrice').value) || 0,
    purchaseDate: document.getElementById('assetModalPurchaseDate').value,
    status: document.getElementById('assetModalStatus').value,
    imageUrl: document.getElementById('assetModalImageUrl').value.trim(),
    notes: document.getElementById('assetModalNotes').value.trim(),
    updatedAt: new Date().toISOString()
  };

  if (!assetData.assetCode || !assetData.name) {
    Swal.fire('ข้อผิดพลาด', 'กรุณากรอกรหัสทรัพย์สินและชื่ออุปกรณ์', 'warning');
    return;
  }

  if (isEdit) {
    const index = appState.assets.findIndex(a => a.id === editId);
    if (index !== -1) {
      assetData.createdAt = appState.assets[index].createdAt || new Date().toISOString();
      appState.assets[index] = assetData;
    }
  } else {
    assetData.createdAt = new Date().toISOString();
    appState.assets.unshift(assetData);
  }

  saveData('assets');
  sendToCloud('saveAsset', assetData);
  closeAssetModal();
  renderAssetsTable();
  if (appState.currentTab === 'dashboard') renderDashboard();

  Swal.fire({
    icon: 'success',
    title: isEdit ? 'อัปเดตข้อมูลสำเร็จ' : 'เพิ่มทรัพย์สินสำเร็จ',
    timer: 1500,
    showConfirmButton: false
  });
}

function deleteAsset(id) {
  const asset = appState.assets.find(a => a.id === id);
  if (!asset) return;

  Swal.fire({
    title: `ลบทรัพย์สิน ${asset.assetCode}?`,
    text: `คุณต้องการลบ "${asset.name}" ออกจากระบบใช่หรือไม่ การกระทำนี้ไม่สามารถย้อนกลับได้`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ใช่, ลบเลย',
    cancelButtonText: 'ยกเลิก'
  }).then((result) => {
    if (result.isConfirmed) {
      appState.assets = appState.assets.filter(a => a.id !== id);
      saveData('assets');
      sendToCloud('deleteAsset', { id: id });
      renderAssetsTable();
      if (appState.currentTab === 'dashboard') renderDashboard();
      Swal.fire('ลบสำเร็จ', 'ลบทรัพย์สินเรียบร้อยแล้ว', 'success');
    }
  });
}

function viewAssetDetails(id) {
  const asset = appState.assets.find(a => a.id === id);
  if (!asset) return;

  const repairs = appState.repairs.filter(r => r.assetId === id || r.assetCode === asset.assetCode);

  document.getElementById('viewAssetCode').textContent = asset.assetCode;
  document.getElementById('viewAssetName').textContent = asset.name;
  document.getElementById('viewAssetId').textContent = asset.id;
  document.getElementById('viewAssetCategory').textContent = asset.category || '-';
  document.getElementById('viewAssetBrand').textContent = asset.brand || '-';
  document.getElementById('viewAssetModel').textContent = asset.model || '-';
  document.getElementById('viewAssetSerial').textContent = asset.serialNumber || 'ไม่มี S/N';
  document.getElementById('viewAssetDept').textContent = asset.department || '-';
  document.getElementById('viewAssetLocation').textContent = asset.location || '-';
  document.getElementById('viewAssetUser').textContent = asset.assignedUser || '-';
  document.getElementById('viewAssetPrice').textContent = (asset.price || 0).toLocaleString('th-TH', { style: 'currency', currency: 'THB' });
  document.getElementById('viewAssetPurchaseDate').textContent = asset.purchaseDate || '-';
  document.getElementById('viewAssetNotes').textContent = asset.notes || '-';
  
  const statusEl = document.getElementById('viewAssetStatus');
  statusEl.textContent = asset.status;
  statusEl.className = `px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadgeClass(asset.status)}`;

  const imgContainer = document.getElementById('viewAssetImageContainer');
  if (asset.imageUrl) {
    imgContainer.innerHTML = `<img src="${asset.imageUrl}" alt="${asset.name}" class="w-full max-h-64 object-contain rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" onerror="this.onerror=null;this.src='https://placehold.co/400x300?text=No+Image';">`;
  } else {
    imgContainer.innerHTML = `<div class="h-40 bg-slate-100 rounded-2xl flex flex-col items-center justify-center text-slate-400 border border-slate-200"><i class="${getCategoryIcon(asset.category)} text-4xl mb-2"></i><span class="text-xs">ไม่มีรูปภาพอุปกรณ์</span></div>`;
  }

  const repairHistoryContainer = document.getElementById('viewAssetRepairHistory');
  if (repairs.length === 0) {
    repairHistoryContainer.innerHTML = `<div class="p-4 text-center text-slate-400 text-xs">ไม่มีประวัติการส่งซ่อมสำหรับอุปกรณ์นี้</div>`;
  } else {
    repairHistoryContainer.innerHTML = `
      <div class="space-y-2">
        ${repairs.map(r => `
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <div class="flex items-center gap-2">
                <span class="font-bold text-slate-800">${r.repairCode}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] ${getRepairStatusBadgeClass(r.status)}">${r.status}</span>
                <span class="text-slate-400 text-[11px]">${r.requestDate || '-'}</span>
              </div>
              <div class="text-slate-700 mt-1 font-medium">${r.problemTitle}</div>
              ${r.repairDetails ? `<div class="text-emerald-700 text-[11px]">วิธีซ่อม: ${r.repairDetails} (ช่าง: ${r.technicianName || '-'})</div>` : ''}
            </div>
            <button onclick="openRepairDetailsModal('${r.id}')" class="px-2 py-1 bg-white border border-slate-200 hover:bg-blue-50 text-blue-600 rounded-lg text-[11px]">
              ดูใบแจ้งซ่อม
            </button>
          </div>
        `).join('')}
      </div>
    `;
  }

  document.getElementById('viewAssetReportBtn').onclick = () => {
    closeViewAssetModal();
    openReportRepairFromAsset(asset.id);
  };

  const printCardBtn = document.getElementById('viewAssetPrintCardBtn');
  if (printCardBtn) {
    printCardBtn.onclick = () => {
      printAssetCard(asset.id);
    };
  }

  document.getElementById('viewAssetPrintLabelBtn').onclick = () => {
    closeViewAssetModal();
    openPrintLabelModal(asset.id);
  };

  document.getElementById('viewAssetModal').classList.remove('hidden');
}

function closeViewAssetModal() {
  document.getElementById('viewAssetModal').classList.add('hidden');
}

// IT Asset Card A4 Printable Generator
function printAssetCard(assetId) {
  const asset = appState.assets.find(a => a.id === assetId);
  if (!asset) return;

  const printArea = document.getElementById('printableArea');
  if (!printArea) return;

  const brandModel = [(asset.brand || '').trim(), (asset.model || '').trim()].filter(Boolean).join(' ') || '-';
  const purchasePriceText = `${asset.purchaseDate || '-'} (฿${(asset.price || 0).toLocaleString('th-TH')})`;
  const imageHtml = asset.imageUrl 
    ? `<img src="${asset.imageUrl}" alt="${asset.name}" style="max-width: 100%; max-height: 250px; object-fit: contain; border-radius: 8px;" onerror="this.onerror=null;this.parentElement.innerHTML='<div style=\\'text-align:center;color:#94a3b8;font-size:12px;\\'>รูปภาพไม่พร้อมใช้งาน</div>';">`
    : `<div style="text-align:center;color:#94a3b8;padding:20px 10px;">
        <i class="${getCategoryIcon(asset.category)}" style="font-size: 52px; margin-bottom: 10px; display: block; color: #cbd5e1;"></i>
        <span style="font-size: 13px; color: #94a3b8;">ไม่มีรูปถ่ายอุปกรณ์</span>
       </div>`;

  printArea.innerHTML = `
    <div style="max-width: 820px; margin: 0 auto; padding: 25px 30px; font-family: 'Prompt', -apple-system, BlinkMacSystemFont, sans-serif; color: #000; background: #ffffff;">
      
      <!-- 1. Header Section -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
        <div>
          <h2 style="margin: 0; font-size: 22px; font-weight: 700; color: #000; letter-spacing: -0.3px;">
            บัตรประวัติและข้อมูลทรัพย์สิน IT (IT Asset Card)
          </h2>
          <p style="margin: 4px 0 0 0; font-size: 13.5px; color: #334155; font-weight: 500;">
            ระบบบริหารจัดการทรัพย์สินเทคโนโลยีสารสนเทศ
          </p>
        </div>
        <div style="border: 2px solid #000; border-radius: 8px; padding: 6px 18px; font-weight: 700; font-size: 16px; font-family: 'Prompt', monospace; text-align: center; min-width: 130px;">
          ${asset.assetCode || '-'}
        </div>
      </div>

      <!-- Header Solid Divider Line -->
      <div style="border-bottom: 2.5px solid #000; margin-bottom: 22px;"></div>

      <!-- 2. Main Info Card (Image on left, Information Grid on right) -->
      <div style="border: 1.5px solid #94a3b8; border-radius: 12px; padding: 18px 22px; display: flex; gap: 26px; margin-bottom: 18px; align-items: stretch; background: #ffffff;">
        
        <!-- Photo Container Box -->
        <div style="width: 250px; min-width: 250px; height: 260px; border: 1.5px solid #cbd5e1; border-radius: 10px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #f8fafc; padding: 6px;">
          ${imageHtml}
        </div>

        <!-- Details Grid -->
        <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between; font-size: 13.5px; line-height: 1.55;">
          
          <div style="display: flex; margin-bottom: 5px;">
            <span style="width: 155px; color: #000; font-weight: 700;">ชื่ออุปกรณ์:</span>
            <span style="flex: 1; font-weight: 700; color: #000;">${asset.name || '-'}</span>
          </div>

          <div style="display: flex; margin-bottom: 5px;">
            <span style="width: 155px; color: #000; font-weight: 700;">หมวดหมู่:</span>
            <span style="flex: 1; color: #1e293b;">${asset.category || '-'}</span>
          </div>

          <div style="display: flex; margin-bottom: 5px;">
            <span style="width: 155px; color: #000; font-weight: 700;">ยี่ห้อ / รุ่น:</span>
            <span style="flex: 1; color: #1e293b;">${brandModel}</span>
          </div>

          <div style="display: flex; margin-bottom: 5px;">
            <span style="width: 155px; color: #000; font-weight: 700;">Serial Number (S/N):</span>
            <span style="flex: 1; color: #1e293b; font-family: monospace;">${asset.serialNumber || '-'}</span>
          </div>

          <div style="display: flex; margin-bottom: 5px;">
            <span style="width: 155px; color: #000; font-weight: 700;">แผนกที่ใช้งาน:</span>
            <span style="flex: 1; font-weight: 700; color: #000;">${asset.department || '-'}</span>
          </div>

          <div style="display: flex; margin-bottom: 5px;">
            <span style="width: 155px; color: #000; font-weight: 700;">ผู้ถือครองใช้งาน:</span>
            <span style="flex: 1; color: #1e293b;">${asset.assignedUser || '-'}</span>
          </div>

          <div style="display: flex; margin-bottom: 5px;">
            <span style="width: 155px; color: #000; font-weight: 700;">สถานที่ตั้ง:</span>
            <span style="flex: 1; color: #1e293b;">${asset.location || '-'}</span>
          </div>

          <div style="display: flex; margin-bottom: 5px;">
            <span style="width: 155px; color: #000; font-weight: 700;">วันที่จัดซื้อ / ราคา:</span>
            <span style="flex: 1; color: #1e293b;">${purchasePriceText}</span>
          </div>

          <div style="display: flex; margin-bottom: 2px;">
            <span style="width: 155px; color: #000; font-weight: 700;">สถานะปัจจุบัน:</span>
            <span style="flex: 1; font-weight: 700; color: #000;">${asset.status || 'ใช้งานได้ปกติ'}</span>
          </div>

        </div>

      </div>

      <!-- 3. Technical Specs Box -->
      <div style="border: 1.5px solid #94a3b8; border-radius: 10px; padding: 14px 18px; margin-bottom: 45px; background: #ffffff;">
        <div style="font-weight: 700; font-size: 13.5px; color: #000; margin-bottom: 6px;">
          สเปกและรายละเอียดทางเทคนิค:
        </div>
        <div style="font-size: 13px; color: #1e293b; min-height: 24px; white-space: pre-wrap; line-height: 1.5;">
          ${asset.notes || '-'}
        </div>
      </div>

      <!-- 4. Signatures Section -->
      <div style="display: flex; justify-content: space-around; align-items: flex-start; text-align: center; margin-top: 55px; font-size: 13px;">
        
        <!-- User Signature Block -->
        <div style="width: 42%;">
          <div style="border-bottom: 1.5px solid #64748b; width: 85%; margin: 0 auto 10px auto; height: 1px;"></div>
          <div style="font-weight: 700; color: #000; margin-bottom: 4px;">ลงชื่อผู้ถือครองทรัพย์สิน</div>
          <div style="color: #64748b; margin-bottom: 6px;">(....................................................)</div>
          <div style="color: #64748b; font-size: 12px;">วันที่ ......./......./.......</div>
        </div>

        <!-- IT Staff Signature Block -->
        <div style="width: 42%;">
          <div style="border-bottom: 1.5px solid #64748b; width: 85%; margin: 0 auto 10px auto; height: 1px;"></div>
          <div style="font-weight: 700; color: #000; margin-bottom: 4px;">ลงชื่อเจ้าหน้าที่ฝ่าย IT</div>
          <div style="color: #64748b; margin-bottom: 6px;">(....................................................)</div>
          <div style="color: #64748b; font-size: 12px;">วันที่ ......./......./.......</div>
        </div>

      </div>

    </div>
  `;

  window.print();
}

function openPrintLabelModal(assetId) {
  const asset = appState.assets.find(a => a.id === assetId);
  if (!asset) return;

  document.getElementById('labelAssetCode').textContent = asset.assetCode;
  document.getElementById('labelAssetName').textContent = asset.name;
  document.getElementById('labelAssetDept').textContent = asset.department || '-';
  document.getElementById('labelAssetUser').textContent = asset.assignedUser || '-';
  document.getElementById('labelAssetSerial').textContent = asset.serialNumber ? `S/N: ${asset.serialNumber}` : '';
  document.getElementById('labelCompanyName').textContent = appState.settings.companyName;

  const qrData = encodeURIComponent(`ASSET:${asset.assetCode}|ID:${asset.id}|DEP:${asset.department}`);
  const qrImg = document.getElementById('labelQrImage');
  qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${qrData}`;

  document.getElementById('printLabelModal').classList.remove('hidden');
}

function closePrintLabelModal() {
  document.getElementById('printLabelModal').classList.add('hidden');
}

function printAssetLabel() {
  const printArea = document.getElementById('printableArea');
  const labelCard = document.getElementById('printableLabelCard').innerHTML;

  printArea.innerHTML = `
    <div style="display:flex; justify-content:center; align-items:center; padding: 20px;">
      <div style="border: 2px dashed #000; padding: 15px; border-radius: 8px; max-width: 420px; width: 100%;">
        ${labelCard}
      </div>
    </div>
  `;

  window.print();
}

// =========================================================================
// 7. REPAIR TICKETING SYSTEM (ระบบแจ้งซ่อม)
// =========================================================================

function getRepairStatusBadgeClass(st) {
  switch (st) {
    case 'รอดำเนินการ': return 'badge-rep-pending';
    case 'กำลังดำเนินการ': return 'badge-rep-process';
    case 'ซ่อมเสร็จสิ้น': return 'badge-rep-done';
    case 'ยกเลิก': return 'badge-rep-cancel';
    default: return 'bg-slate-100 text-slate-600';
  }
}

function getRepairIcon(st) {
  switch (st) {
    case 'รอดำเนินการ': return 'fa-solid fa-hourglass-start text-amber-600';
    case 'กำลังดำเนินการ': return 'fa-solid fa-screwdriver-wrench text-indigo-600';
    case 'ซ่อมเสร็จสิ้น': return 'fa-solid fa-circle-check text-emerald-600';
    default: return 'fa-solid fa-circle-xmark text-slate-500';
  }
}

function getRepairIconBg(st) {
  switch (st) {
    case 'รอดำเนินการ': return 'bg-amber-100';
    case 'กำลังดำเนินการ': return 'bg-indigo-100';
    case 'ซ่อมเสร็จสิ้น': return 'bg-emerald-100';
    default: return 'bg-slate-100';
  }
}

function handleRepairSearch(val) {
  appState.repairFilter.search = val.toLowerCase().trim();
  renderRepairsTable();
}

function handleRepairFilterStatus(st) {
  appState.repairFilter.status = st;
  renderRepairsTable();
}

function handleRepairFilterDept(dept) {
  appState.repairFilter.department = dept;
  renderRepairsTable();
}

function getFilteredRepairs() {
  const { search, status, department } = appState.repairFilter;
  return appState.repairs.filter(r => {
    if (status !== 'all' && r.status !== status) return false;
    if (department !== 'all' && r.department !== department) return false;
    if (search) {
      const matchCode = (r.repairCode || '').toLowerCase().includes(search);
      const matchAsset = (r.assetCode || '').toLowerCase().includes(search);
      const matchName = (r.assetName || '').toLowerCase().includes(search);
      const matchProblem = (r.problemTitle || '').toLowerCase().includes(search);
      const matchReporter = (r.reporterName || '').toLowerCase().includes(search);
      const matchTech = (r.technicianName || '').toLowerCase().includes(search);
      if (!matchCode && !matchAsset && !matchName && !matchProblem && !matchReporter && !matchTech) {
        return false;
      }
    }
    return true;
  });
}

function renderRepairsTable() {
  const list = getFilteredRepairs();
  const tbody = document.getElementById('repairsTableBody');
  const countBadge = document.getElementById('filteredRepairCount');

  if (countBadge) countBadge.textContent = `${list.length} / ${appState.repairs.length} รายการ`;
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-12 text-slate-400">
          <i class="fa-solid fa-screwdriver-wrench text-4xl mb-2 opacity-50 block"></i>
          ไม่พบข้อมูลรายการแจ้งซ่อมที่ตรงกับเงื่อนไข
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map((r, idx) => `
    <tr class="hover:bg-blue-50/40 border-b border-slate-100 transition text-xs sm:text-sm">
      <td class="py-3 px-3 text-center text-slate-400 font-mono text-xs">${idx + 1}</td>
      <td class="py-3 px-3">
        <div class="font-bold text-slate-900">${r.repairCode}</div>
        <div class="text-[11px] text-slate-400"><i class="fa-regular fa-calendar mr-1"></i>${r.requestDate || '-'}</div>
      </td>
      <td class="py-3 px-3">
        <div class="font-semibold text-blue-600">${r.assetCode}</div>
        <div class="text-xs text-slate-600">${r.assetName}</div>
      </td>
      <td class="py-3 px-3">
        <div class="font-medium text-slate-800">${r.problemTitle}</div>
        <div class="text-xs text-slate-500 truncate max-w-xs">${r.problemDesc || '-'}</div>
      </td>
      <td class="py-3 px-3">
        <div class="font-medium text-slate-700">${r.reporterName}</div>
        <div class="text-xs text-slate-400">${r.department}</div>
      </td>
      <td class="py-3 px-3">
        <div class="text-xs font-medium text-slate-700">${r.technicianName || '<span class="text-slate-400">ยังไม่มอบหมาย</span>'}</div>
        ${r.completedDate ? `<div class="text-[11px] text-emerald-600"><i class="fa-solid fa-check mr-1"></i>${r.completedDate}</div>` : ''}
      </td>
      <td class="py-3 px-3 text-center">
        <span class="px-2.5 py-1 rounded-full text-xs font-semibold ${getRepairStatusBadgeClass(r.status)}">
          ${r.status}
        </span>
      </td>
      <td class="py-3 px-3 text-right">
        <div class="flex items-center justify-end gap-1.5">
          <button onclick="openRepairDetailsModal('${r.id}')" title="ดูรายละเอียด" class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-blue-100 hover:text-blue-600 text-slate-600 transition flex items-center justify-center">
            <i class="fa-solid fa-eye text-xs"></i>
          </button>
          <button onclick="printWorkOrder('${r.id}')" title="พิมพ์ใบแจ้งซ่อม A4" class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-purple-100 hover:text-purple-600 text-slate-600 transition flex items-center justify-center">
            <i class="fa-solid fa-print text-xs"></i>
          </button>
          ${appState.currentUser && (appState.currentUser.role === 'admin' || appState.currentUser.role === 'technician') ? `
            <button onclick="openTechnicianActionModal('${r.id}')" title="อัปเดตการซ่อม / ปิดงาน" class="w-8 h-8 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-600 transition flex items-center justify-center">
              <i class="fa-solid fa-wrench text-xs"></i>
            </button>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

function openCreateRepairModal() {
  document.getElementById('repairModalForm').reset();
  removeImage('repairModalBeforeImage', 'repairModalBeforeImagePreview');
  
  const year = new Date().getFullYear();
  const nextNum = (appState.repairs.length + 1).toString().padStart(4, '0');
  document.getElementById('repairModalCode').value = `RP-${year}-${nextNum}`;
  document.getElementById('repairModalDate').value = new Date().toISOString().split('T')[0];

  if (appState.currentUser) {
    document.getElementById('repairModalReporter').value = appState.currentUser.fullName;
    document.getElementById('repairModalDept').value = appState.currentUser.department || '';
  }

  const assetSelect = document.getElementById('repairModalAssetSelect');
  if (assetSelect) {
    assetSelect.innerHTML = `<option value="">-- เลือกอุปกรณ์ที่ต้องการแจ้งซ่อม --</option>` +
      appState.assets.map(a => `<option value="${a.id}">${a.assetCode} - ${a.name} (${a.department || 'ไม่ระบุ'})</option>`).join('');
  }

  document.getElementById('createRepairModal').classList.remove('hidden');
}

function handleAssetSelectChange(assetId) {
  const asset = appState.assets.find(a => a.id === assetId);
  if (asset) {
    document.getElementById('repairModalAssetCode').value = asset.assetCode;
    document.getElementById('repairModalAssetName').value = asset.name;
    if (asset.department) {
      document.getElementById('repairModalDept').value = asset.department;
    }
  }
}

function openReportRepairFromAsset(assetId) {
  openCreateRepairModal();
  const assetSelect = document.getElementById('repairModalAssetSelect');
  if (assetSelect) {
    assetSelect.value = assetId;
    handleAssetSelectChange(assetId);
  }
}

function closeCreateRepairModal() {
  document.getElementById('createRepairModal').classList.add('hidden');
}

function handleCreateRepairSubmit(event) {
  event.preventDefault();

  const assetId = document.getElementById('repairModalAssetSelect').value;
  const assetCode = document.getElementById('repairModalAssetCode').value.trim();
  const assetName = document.getElementById('repairModalAssetName').value.trim();
  const reporterName = document.getElementById('repairModalReporter').value.trim();
  const department = document.getElementById('repairModalDept').value;
  const problemTitle = document.getElementById('repairModalTitle').value.trim();
  const problemDesc = document.getElementById('repairModalDesc').value.trim();
  const requestDate = document.getElementById('repairModalDate').value;
  const beforeImageUrl = document.getElementById('repairModalBeforeImage').value.trim();

  if (!assetCode || !problemTitle || !reporterName) {
    Swal.fire('ข้อผิดพลาด', 'กรุณาระบุทรัพย์สิน, อาการที่พบ, และชื่อผู้แจ้งซ่อม', 'warning');
    return;
  }

  const now = new Date();
  const dateStr = now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);

  const newTicket = {
    id: `REP${dateStr}`,
    repairCode: document.getElementById('repairModalCode').value.trim(),
    assetId: assetId || '',
    assetCode: assetCode,
    assetName: assetName,
    reporterName: reporterName,
    department: department,
    problemTitle: problemTitle,
    problemDesc: problemDesc,
    beforeImageUrl: beforeImageUrl,
    afterImageUrl: '',
    status: 'รอดำเนินการ',
    technicianName: '',
    repairDetails: '',
    cost: 0,
    requestDate: requestDate,
    repairDate: '',
    completedDate: '',
    updatedAt: now.toISOString()
  };

  appState.repairs.unshift(newTicket);

  if (assetId) {
    const asset = appState.assets.find(a => a.id === assetId);
    if (asset) {
      asset.status = 'ส่งซ่อม';
      saveData('assets');
    }
  }

  saveData('repairs');
  sendToCloud('saveRepair', newTicket);
  closeCreateRepairModal();
  renderRepairsTable();
  if (appState.currentTab === 'dashboard') renderDashboard();

  Swal.fire({
    icon: 'success',
    title: 'ส่งใบแจ้งซ่อมสำเร็จ',
    text: `รหัสใบแจ้งซ่อม: ${newTicket.repairCode}`,
    timer: 2000,
    showConfirmButton: false
  });
}

function openTechnicianActionModal(repairId) {
  const repair = appState.repairs.find(r => r.id === repairId);
  if (!repair) return;

  document.getElementById('techActionRepairId').value = repair.id;
  document.getElementById('techActionCode').textContent = repair.repairCode;
  document.getElementById('techActionAsset').textContent = `${repair.assetCode} - ${repair.assetName}`;
  document.getElementById('techActionProblem').textContent = repair.problemTitle;
  document.getElementById('techActionStatus').value = repair.status || 'กำลังดำเนินการ';
  
  document.getElementById('techActionTechName').value = repair.technicianName || (appState.currentUser ? appState.currentUser.fullName.split(' ')[0] : '');
  document.getElementById('techActionDate').value = repair.repairDate || new Date().toISOString().split('T')[0];
  document.getElementById('techActionCompletedDate').value = repair.completedDate || (repair.status === 'ซ่อมเสร็จสิ้น' ? new Date().toISOString().split('T')[0] : '');
  document.getElementById('techActionDetails').value = repair.repairDetails || '';
  document.getElementById('techActionCost').value = repair.cost || 0;
  document.getElementById('techActionAfterImage').value = repair.afterImageUrl || '';

  renderImagePreview('techActionAfterImagePreview', 'techActionAfterImage', repair.afterImageUrl);

  document.getElementById('technicianActionModal').classList.remove('hidden');
}

function closeTechnicianActionModal() {
  document.getElementById('technicianActionModal').classList.add('hidden');
}

function handleTechnicianActionSubmit(event) {
  event.preventDefault();
  const repairId = document.getElementById('techActionRepairId').value;
  const repair = appState.repairs.find(r => r.id === repairId);
  if (!repair) return;

  const newStatus = document.getElementById('techActionStatus').value;
  const techName = document.getElementById('techActionTechName').value.trim();
  const repairDetails = document.getElementById('techActionDetails').value.trim();
  const cost = parseFloat(document.getElementById('techActionCost').value) || 0;
  const repairDate = document.getElementById('techActionDate').value;
  const completedDate = document.getElementById('techActionCompletedDate').value;
  const afterImageUrl = document.getElementById('techActionAfterImage').value.trim();

  repair.status = newStatus;
  repair.technicianName = techName;
  repair.repairDetails = repairDetails;
  repair.cost = cost;
  repair.repairDate = repairDate;
  repair.completedDate = newStatus === 'ซ่อมเสร็จสิ้น' ? (completedDate || new Date().toISOString().split('T')[0]) : '';
  repair.afterImageUrl = afterImageUrl;
  repair.updatedAt = new Date().toISOString();

  if (newStatus === 'ซ่อมเสร็จสิ้น') {
    const asset = appState.assets.find(a => a.id === repair.assetId || a.assetCode === repair.assetCode);
    if (asset && asset.status === 'ส่งซ่อม') {
      asset.status = 'ใช้งานได้ปกติ';
      saveData('assets');
    }
  }

  saveData('repairs');
  sendToCloud('saveRepair', repair);
  closeTechnicianActionModal();
  renderRepairsTable();
  if (appState.currentTab === 'dashboard') renderDashboard();

  Swal.fire({
    icon: 'success',
    title: 'อัปเดตงานซ่อมเรียบร้อย',
    timer: 1500,
    showConfirmButton: false
  });
}

function openRepairDetailsModal(id) {
  const rep = appState.repairs.find(r => r.id === id);
  if (!rep) return;

  document.getElementById('detailRepCode').textContent = rep.repairCode;
  document.getElementById('detailRepStatus').textContent = rep.status;
  document.getElementById('detailRepStatus').className = `px-3 py-1 rounded-full text-xs font-semibold ${getRepairStatusBadgeClass(rep.status)}`;
  
  document.getElementById('detailRepAssetCode').textContent = rep.assetCode;
  document.getElementById('detailRepAssetName').textContent = rep.assetName;
  document.getElementById('detailRepReporter').textContent = rep.reporterName;
  document.getElementById('detailRepDept').textContent = rep.department;
  document.getElementById('detailRepDate').textContent = rep.requestDate || '-';
  document.getElementById('detailRepTitle').textContent = rep.problemTitle;
  document.getElementById('detailRepDesc').textContent = rep.problemDesc || '-';

  document.getElementById('detailRepTech').textContent = rep.technicianName || 'ยังไม่ระบุ';
  document.getElementById('detailRepRepairDate').textContent = rep.repairDate || '-';
  document.getElementById('detailRepCompletedDate').textContent = rep.completedDate || '-';
  document.getElementById('detailRepDetails').textContent = rep.repairDetails || 'ยังไม่มีการบันทึก';
  document.getElementById('detailRepCost').textContent = (rep.cost || 0).toLocaleString('th-TH', { style: 'currency', currency: 'THB' });

  const imgBefore = document.getElementById('detailRepBeforeImg');
  if (rep.beforeImageUrl) {
    imgBefore.innerHTML = `<img src="${rep.beforeImageUrl}" class="w-full max-h-48 object-contain rounded-xl border border-slate-200">`;
  } else {
    imgBefore.innerHTML = `<div class="h-28 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 text-xs">ไม่มีรูปก่อนซ่อม</div>`;
  }

  const imgAfter = document.getElementById('detailRepAfterImg');
  if (rep.afterImageUrl) {
    imgAfter.innerHTML = `<img src="${rep.afterImageUrl}" class="w-full max-h-48 object-contain rounded-xl border border-slate-200">`;
  } else {
    imgAfter.innerHTML = `<div class="h-28 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 text-xs">ไม่มีรูปหลังซ่อม</div>`;
  }

  document.getElementById('detailRepPrintBtn').onclick = () => {
    printWorkOrder(rep.id);
  };

  document.getElementById('repairDetailsModal').classList.remove('hidden');
}

function closeRepairDetailsModal() {
  document.getElementById('repairDetailsModal').classList.add('hidden');
}

function printWorkOrder(repairId) {
  const rep = appState.repairs.find(r => r.id === repairId);
  if (!rep) return;

  const printArea = document.getElementById('printableArea');
  printArea.innerHTML = `
    <div style="font-family: 'Prompt', sans-serif; color: #1e293b; max-width: 800px; margin: 0 auto; padding: 20px;">
      <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 16px;">
        <div>
          <h2 style="font-size: 20px; font-weight: bold; margin: 0; color: #1e3a8a;">${appState.settings.companyName}</h2>
          <p style="font-size: 13px; color: #64748b; margin: 2px 0 0 0;">ใบแจ้งซ่อมและบันทึกผลการปฏิบัติงานด้านสารสนเทศ (Work Order & Maintenance Ticket)</p>
        </div>
        <div style="text-align: right;">
          <h3 style="font-size: 18px; font-weight: bold; margin: 0; color: #2563eb;">${rep.repairCode}</h3>
          <p style="font-size: 12px; color: #64748b; margin: 2px 0 0 0;">สถานะ: <strong>${rep.status}</strong></p>
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px;">
        <tr>
          <td style="padding: 6px; background: #f8fafc; border: 1px solid #e2e8f0; width: 18%; font-weight: bold;">รหัสทรัพย์สิน:</td>
          <td style="padding: 6px; border: 1px solid #e2e8f0; width: 32%;">${rep.assetCode}</td>
          <td style="padding: 6px; background: #f8fafc; border: 1px solid #e2e8f0; width: 18%; font-weight: bold;">วันที่แจ้ง:</td>
          <td style="padding: 6px; border: 1px solid #e2e8f0; width: 32%;">${rep.requestDate || '-'}</td>
        </tr>
        <tr>
          <td style="padding: 6px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: bold;">ชื่ออุปกรณ์:</td>
          <td style="padding: 6px; border: 1px solid #e2e8f0;">${rep.assetName}</td>
          <td style="padding: 6px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: bold;">แผนก:</td>
          <td style="padding: 6px; border: 1px solid #e2e8f0;">${rep.department}</td>
        </tr>
        <tr>
          <td style="padding: 6px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: bold;">ผู้แจ้งซ่อม:</td>
          <td style="padding: 6px; border: 1px solid #e2e8f0;">${rep.reporterName}</td>
          <td style="padding: 6px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: bold;">ช่างผู้รับผิดชอบ:</td>
          <td style="padding: 6px; border: 1px solid #e2e8f0;">${rep.technicianName || '-'}</td>
        </tr>
      </table>

      <div style="border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 16px;">
        <h4 style="margin: 0 0 6px 0; font-size: 14px; color: #b45309; font-weight: bold;">อาการเสีย / ปัญหาที่ได้รับแจ้ง (Reported Issue):</h4>
        <p style="margin: 0 0 4px 0; font-size: 13px; font-weight: 600;">${rep.problemTitle}</p>
        <p style="margin: 0; font-size: 12px; color: #475569;">${rep.problemDesc || 'ไม่มีรายละเอียดเพิ่มเติม'}</p>
      </div>

      <div style="border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 24px;">
        <h4 style="margin: 0 0 6px 0; font-size: 14px; color: #047857; font-weight: bold;">ผลการตรวจสอบและการแก้ไข (Resolution & Actions Taken):</h4>
        <p style="margin: 0 0 8px 0; font-size: 13px;">${rep.repairDetails || 'ยังไม่ระบุผลการซ่อม'}</p>
        <div style="display: flex; gap: 20px; font-size: 12px; color: #64748b;">
          <span>วันที่เริ่มซ่อม: <strong>${rep.repairDate || '-'}</strong></span>
          <span>วันที่เสร็จสิ้น: <strong>${rep.completedDate || '-'}</strong></span>
          <span>ค่าใช้จ่าย/ค่าอะไหล่: <strong>${(rep.cost || 0).toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}</strong></span>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; margin-top: 40px; text-align: center; font-size: 12px;">
        <div style="width: 30%;">
          <div style="border-bottom: 1px solid #94a3b8; height: 40px; margin-bottom: 6px;"></div>
          <p style="margin: 0; font-weight: 600;">( ${rep.reporterName} )</p>
          <p style="margin: 2px 0 0 0; color: #64748b;">ผู้แจ้งซ่อม</p>
        </div>
        <div style="width: 30%;">
          <div style="border-bottom: 1px solid #94a3b8; height: 40px; margin-bottom: 6px;"></div>
          <p style="margin: 0; font-weight: 600;">( ${rep.technicianName || '...........................................'} )</p>
          <p style="margin: 2px 0 0 0; color: #64748b;">ช่างผู้ปฏิบัติงาน</p>
        </div>
        <div style="width: 30%;">
          <div style="border-bottom: 1px solid #94a3b8; height: 40px; margin-bottom: 6px;"></div>
          <p style="margin: 0; font-weight: 600;">( ........................................... )</p>
          <p style="margin: 2px 0 0 0; color: #64748b;">ผู้ตรวจสอบ / หัวหน้างาน</p>
        </div>
      </div>
    </div>
  `;

  window.print();
}

// =========================================================================
// 8. ADVANCED REPAIR REPORTS (ระบบออกรีพอร์ตประจำเดือน / ประจำปี / ตามแผนก)
// =========================================================================

function renderReportsView() {
  // Populate Year options (from past 5 years to next 2 years)
  const yearSelect = document.getElementById('reportFilterYear');
  if (yearSelect && yearSelect.options.length <= 1) {
    const curYear = new Date().getFullYear();
    yearSelect.innerHTML = '';
    for (let y = curYear; y >= curYear - 5; y--) {
      yearSelect.innerHTML += `<option value="${y}">ปี พ.ศ. ${y + 543} (${y})</option>`;
    }
    yearSelect.value = appState.reportFilter.year;
  }

  // Set default month
  const monthSelect = document.getElementById('reportFilterMonth');
  if (monthSelect) {
    monthSelect.value = appState.reportFilter.month;
  }

  // Handle period toggle UI
  handleReportPeriodTypeChange(appState.reportFilter.periodType);

  // Generate initial report
  generateRepairReport();
}

function handleReportPeriodTypeChange(type) {
  appState.reportFilter.periodType = type;

  const monthBox = document.getElementById('reportMonthBox');
  const yearBox = document.getElementById('reportYearBox');
  const customBox = document.getElementById('reportCustomDateBox');

  if (monthBox) monthBox.classList.add('hidden');
  if (yearBox) yearBox.classList.add('hidden');
  if (customBox) customBox.classList.add('hidden');

  if (type === 'month') {
    if (monthBox) monthBox.classList.remove('hidden');
    if (yearBox) yearBox.classList.remove('hidden');
  } else if (type === 'year') {
    if (yearBox) yearBox.classList.remove('hidden');
  } else if (type === 'custom') {
    if (customBox) customBox.classList.remove('hidden');
  }
}

function getFilteredReportData() {
  const { periodType, month, year, startDate, endDate, department, status } = appState.reportFilter;

  return appState.repairs.filter(r => {
    // Dept of reporter filter
    if (department !== 'all' && r.department !== department) {
      return false;
    }

    // Status filter
    if (status !== 'all' && r.status !== status) {
      return false;
    }

    // Date Filtering based on requestDate (YYYY-MM-DD)
    if (!r.requestDate) return false;
    const reqDate = r.requestDate; // "2026-10-15"
    const reqYear = reqDate.slice(0, 4);
    const reqMonth = reqDate.slice(5, 7);

    if (periodType === 'month') {
      if (reqYear !== year || reqMonth !== month) return false;
    } else if (periodType === 'year') {
      if (reqYear !== year) return false;
    } else if (periodType === 'custom') {
      if (startDate && reqDate < startDate) return false;
      if (endDate && reqDate > endDate) return false;
    }

    return true;
  });
}

function generateRepairReport() {
  // Read inputs from DOM
  const periodType = document.querySelector('input[name="reportPeriod"]:checked')?.value || 'month';
  appState.reportFilter.periodType = periodType;
  appState.reportFilter.month = document.getElementById('reportFilterMonth')?.value || '10';
  appState.reportFilter.year = document.getElementById('reportFilterYear')?.value || '2026';
  appState.reportFilter.startDate = document.getElementById('reportFilterStartDate')?.value || '';
  appState.reportFilter.endDate = document.getElementById('reportFilterEndDate')?.value || '';
  appState.reportFilter.department = document.getElementById('reportFilterDept')?.value || 'all';
  appState.reportFilter.status = document.getElementById('reportFilterStatus')?.value || 'all';

  const reportData = getFilteredReportData();

  // Summary Metrics
  const total = reportData.length;
  const completed = reportData.filter(r => r.status === 'ซ่อมเสร็จสิ้น').length;
  const pending = reportData.filter(r => r.status === 'รอดำเนินการ').length;
  const inProgress = reportData.filter(r => r.status === 'กำลังดำเนินการ').length;
  const totalCost = reportData.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0);

  // Update DOM Summary
  document.getElementById('reportStatTotal').textContent = total.toLocaleString();
  document.getElementById('reportStatCompleted').textContent = completed.toLocaleString();
  document.getElementById('reportStatPending').textContent = (pending + inProgress).toLocaleString();
  document.getElementById('reportStatCost').textContent = totalCost.toLocaleString('th-TH', { style: 'currency', currency: 'THB' });

  // Update Report Scope Label
  let scopeLabel = '';
  const monthNames = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  
  if (periodType === 'month') {
    scopeLabel = `ประจำเดือน ${monthNames[parseInt(appState.reportFilter.month, 10)]} พ.ศ. ${parseInt(appState.reportFilter.year, 10) + 543}`;
  } else if (periodType === 'year') {
    scopeLabel = `ประจำปี พ.ศ. ${parseInt(appState.reportFilter.year, 10) + 543}`;
  } else if (periodType === 'custom') {
    scopeLabel = `ช่วงวันที่ ${appState.reportFilter.startDate || 'แรกสุด'} ถึง ${appState.reportFilter.endDate || 'ปัจจุบัน'}`;
  } else {
    scopeLabel = 'ข้อมูลทั้งหมดตั้งแต่เริ่มระบบ';
  }

  if (appState.reportFilter.department !== 'all') {
    scopeLabel += ` • แผนก: ${appState.reportFilter.department}`;
  }

  document.getElementById('reportScopeTitle').textContent = scopeLabel;
  document.getElementById('reportDataCount').textContent = `พบ ${total} รายการ`;

  // Render Table
  const tbody = document.getElementById('reportTableBody');
  if (!tbody) return;

  if (reportData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-10 text-slate-400">
          <i class="fa-regular fa-folder-open text-4xl mb-2 block opacity-40"></i>
          ไม่พบรายการแจ้งซ่อมตามเงื่อนไขที่เลือก (${scopeLabel})
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = reportData.map((r, idx) => `
    <tr class="hover:bg-blue-50/40 border-b border-slate-100 transition text-xs">
      <td class="py-3 px-3 text-center text-slate-400 font-mono">${idx + 1}</td>
      <td class="py-3 px-3 font-bold font-mono text-blue-600">${r.repairCode}</td>
      <td class="py-3 px-3 text-slate-600">${r.requestDate || '-'}</td>
      <td class="py-3 px-3">
        <div class="font-semibold text-slate-800">${r.assetCode}</div>
        <div class="text-[11px] text-slate-500">${r.assetName}</div>
      </td>
      <td class="py-3 px-3 font-medium text-slate-700">${r.department}</td>
      <td class="py-3 px-3">${r.reporterName}</td>
      <td class="py-3 px-3">
        <div class="font-medium text-slate-800">${r.problemTitle}</div>
        ${r.repairDetails ? `<div class="text-[11px] text-emerald-700">ผลซ่อม: ${r.repairDetails}</div>` : ''}
      </td>
      <td class="py-3 px-3 text-slate-700">${r.technicianName || '-'}</td>
      <td class="py-3 px-3 text-center">
        <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold ${getRepairStatusBadgeClass(r.status)}">
          ${r.status}
        </span>
      </td>
    </tr>
  `).join('');
}

// Print Official A4 Report
function printRepairReportA4() {
  const reportData = getFilteredReportData();
  const scopeLabel = document.getElementById('reportScopeTitle').textContent;
  const printArea = document.getElementById('printableArea');

  const total = reportData.length;
  const completed = reportData.filter(r => r.status === 'ซ่อมเสร็จสิ้น').length;
  const pending = reportData.filter(r => r.status === 'รอดำเนินการ').length;
  const inProgress = reportData.filter(r => r.status === 'กำลังดำเนินการ').length;
  const totalCost = reportData.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0);

  printArea.innerHTML = `
    <div style="font-family: 'Prompt', sans-serif; color: #1e293b; max-width: 950px; margin: 0 auto; padding: 20px;">
      
      <!-- Report Header -->
      <div style="border-bottom: 2px solid #1e40af; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <h2 style="font-size: 20px; font-weight: bold; margin: 0; color: #1e3a8a;">${appState.settings.companyName}</h2>
          <h3 style="font-size: 16px; font-weight: bold; margin: 4px 0 0 0; color: #2563eb;">รายงานสรุปผลการแจ้งซ่อมและบำรุงรักษาอุปกรณ์ไอที (IT Maintenance Report)</h3>
          <p style="font-size: 13px; color: #475569; margin: 2px 0 0 0;"><strong>ขอบเขตรายงาน:</strong> ${scopeLabel}</p>
        </div>
        <div style="text-align: right; font-size: 11px; color: #64748b;">
          <div>วันที่พิมพ์: <strong>${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong></div>
          <div>ผู้ออกรายงาน: <strong>${appState.currentUser ? appState.currentUser.fullName : 'Admin'}</strong></div>
        </div>
      </div>

      <!-- KPI Summary Cards -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px; text-align: center;">
        <tr>
          <td style="padding: 8px; border: 1px solid #cbd5e1; background: #f8fafc; width: 25%;">
            <div style="color: #64748b;">งานแจ้งซ่อมทั้งหมด</div>
            <div style="font-size: 18px; font-weight: bold; color: #1e293b;">${total} รายการ</div>
          </td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; background: #ecfdf5; width: 25%;">
            <div style="color: #047857;">ซ่อมเสร็จสิ้นแล้ว</div>
            <div style="font-size: 18px; font-weight: bold; color: #047857;">${completed} รายการ</div>
          </td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; background: #fffbeb; width: 25%;">
            <div style="color: #b45309;">รอดำเนินการ / กำลังซ่อม</div>
            <div style="font-size: 18px; font-weight: bold; color: #b45309;">${pending + inProgress} รายการ</div>
          </td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; background: #eff6ff; width: 25%;">
            <div style="color: #1d4ed8;">ค่าใช้จ่ายการซ่อมรวม</div>
            <div style="font-size: 18px; font-weight: bold; color: #1d4ed8;">${totalCost.toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}</div>
          </td>
        </tr>
      </table>

      <!-- Detailed Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 11px;">
        <thead>
          <tr style="background: #f1f5f9; border: 1px solid #cbd5e1; text-align: left;">
            <th style="padding: 6px; border: 1px solid #cbd5e1; width: 4%; text-align: center;">#</th>
            <th style="padding: 6px; border: 1px solid #cbd5e1; width: 12%;">เลขที่แจ้งซ่อม</th>
            <th style="padding: 6px; border: 1px solid #cbd5e1; width: 10%;">วันที่แจ้ง</th>
            <th style="padding: 6px; border: 1px solid #cbd5e1; width: 18%;">ทรัพย์สิน</th>
            <th style="padding: 6px; border: 1px solid #cbd5e1; width: 12%;">แผนกผู้แจ้ง</th>
            <th style="padding: 6px; border: 1px solid #cbd5e1; width: 12%;">ผู้แจ้งซ่อม</th>
            <th style="padding: 6px; border: 1px solid #cbd5e1;">ปัญหา / ผลการซ่อม</th>
            <th style="padding: 6px; border: 1px solid #cbd5e1; width: 8%;">ช่างผู้ซ่อม</th>
            <th style="padding: 6px; border: 1px solid #cbd5e1; width: 10%; text-align: center;">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          ${reportData.length === 0 ? `
            <tr><td colspan="9" style="padding: 20px; text-align: center; color: #94a3b8;">ไม่มีรายการแจ้งซ่อมตามเงื่อนไขที่เลือก</td></tr>
          ` : reportData.map((r, i) => `
            <tr style="border: 1px solid #e2e8f0;">
              <td style="padding: 5px; border: 1px solid #e2e8f0; text-align: center;">${i + 1}</td>
              <td style="padding: 5px; border: 1px solid #e2e8f0; font-weight: bold;">${r.repairCode}</td>
              <td style="padding: 5px; border: 1px solid #e2e8f0;">${r.requestDate || '-'}</td>
              <td style="padding: 5px; border: 1px solid #e2e8f0;"><strong>${r.assetCode}</strong><br><span style="color:#64748b;">${r.assetName}</span></td>
              <td style="padding: 5px; border: 1px solid #e2e8f0;">${r.department}</td>
              <td style="padding: 5px; border: 1px solid #e2e8f0;">${r.reporterName}</td>
              <td style="padding: 5px; border: 1px solid #e2e8f0;">
                <div><strong>${r.problemTitle}</strong></div>
                ${r.repairDetails ? `<div style="color: #047857; font-size: 10px;">วิธีซ่อม: ${r.repairDetails}</div>` : ''}
              </td>
              <td style="padding: 5px; border: 1px solid #e2e8f0;">${r.technicianName || '-'}</td>
              <td style="padding: 5px; border: 1px solid #e2e8f0; text-align: center; font-weight: bold;">${r.status}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <!-- Signatures Footer -->
      <div style="display: flex; justify-content: space-between; margin-top: 40px; text-align: center; font-size: 11px;">
        <div style="width: 28%;">
          <div style="border-bottom: 1px solid #94a3b8; height: 35px; margin-bottom: 6px;"></div>
          <p style="margin: 0; font-weight: 600;">( ${appState.currentUser ? appState.currentUser.fullName : '...........................................'} )</p>
          <p style="margin: 2px 0 0 0; color: #64748b;">ผู้จัดทำรายงาน</p>
        </div>
        <div style="width: 28%;">
          <div style="border-bottom: 1px solid #94a3b8; height: 35px; margin-bottom: 6px;"></div>
          <p style="margin: 0; font-weight: 600;">( ........................................... )</p>
          <p style="margin: 2px 0 0 0; color: #64748b;">หัวหน้าแผนกสารสนเทศ / IT</p>
        </div>
        <div style="width: 28%;">
          <div style="border-bottom: 1px solid #94a3b8; height: 35px; margin-bottom: 6px;"></div>
          <p style="margin: 0; font-weight: 600;">( ........................................... )</p>
          <p style="margin: 2px 0 0 0; color: #64748b;">ผู้อำนวยการ / ผู้บริหาร</p>
        </div>
      </div>

    </div>
  `;

  window.print();
}

// Export Filtered Report To Excel
function exportFilteredReportToExcel() {
  if (typeof XLSX === 'undefined') {
    Swal.fire('ข้อผิดพลาด', 'ไม่พบไลบรารี SheetJS', 'error');
    return;
  }

  const reportData = getFilteredReportData();
  if (reportData.length === 0) {
    Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลรายการแจ้งซ่อมตามเงื่อนไขที่เลือก', 'info');
    return;
  }

  const exportData = reportData.map((r, idx) => ({
    'ลำดับ': idx + 1,
    'เลขที่ใบแจ้งซ่อม': r.repairCode,
    'วันที่แจ้งซ่อม': r.requestDate,
    'รหัสทรัพย์สิน': r.assetCode,
    'ชื่ออุปกรณ์': r.assetName,
    'แผนกผู้แจ้ง': r.department,
    'ผู้แจ้งซ่อม': r.reporterName,
    'ปัญหาที่พบ': r.problemTitle,
    'รายละเอียดเพิ่มเติม': r.problemDesc,
    'สถานะงานซ่อม': r.status,
    'ช่างผู้รับผิดชอบ': r.technicianName,
    'วิธีการแก้ไข': r.repairDetails,
    'วันที่เริ่มซ่อม': r.repairDate,
    'วันที่ซ่อมเสร็จ': r.completedDate,
    'ค่าใช้จ่าย (บาท)': r.cost
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Repair_Report");

  const pType = appState.reportFilter.periodType;
  let fileSuffix = pType === 'month' ? `${appState.reportFilter.year}-${appState.reportFilter.month}` : appState.reportFilter.year;
  if (appState.reportFilter.department !== 'all') fileSuffix += `_${appState.reportFilter.department}`;

  const fileName = `Repair_Report_${fileSuffix}.xlsx`;
  XLSX.writeFile(wb, fileName);

  Swal.fire({
    icon: 'success',
    title: 'ส่งออกรายงาน Excel สำเร็จ',
    text: `บันทึกไฟล์เป็น ${fileName}`,
    timer: 2000,
    showConfirmButton: false
  });
}

// =========================================================================
// 9. DEPARTMENTS & USERS MANAGEMENT
// =========================================================================

function renderDepartmentsTable() {
  const tbody = document.getElementById('departmentsTableBody');
  if (!tbody) return;

  const depts = appState.departments;
  tbody.innerHTML = depts.map((d, idx) => {
    const assetCount = appState.assets.filter(a => a.department === d.name).length;
    const repairCount = appState.repairs.filter(r => r.department === d.name).length;

    return `
      <tr class="hover:bg-blue-50/40 border-b border-slate-100 transition text-xs sm:text-sm">
        <td class="py-3 px-3 text-center text-slate-400 font-mono">${idx + 1}</td>
        <td class="py-3 px-3 font-mono font-bold text-blue-600">${d.id}</td>
        <td class="py-3 px-3 font-semibold text-slate-800">${d.name}</td>
        <td class="py-3 px-3 text-center">
          <span class="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-bold text-xs">
            ${assetCount} เครื่อง
          </span>
        </td>
        <td class="py-3 px-3 text-center">
          <span class="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-bold text-xs">
            ${repairCount} รายการ
          </span>
        </td>
        <td class="py-3 px-3 text-right">
          <button onclick="editDepartment('${d.id}')" class="px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-lg">
            <i class="fa-solid fa-pen mr-1"></i> แก้ไข
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function openAddDepartmentModal() {
  Swal.fire({
    title: 'เพิ่มแผนกใหม่',
    input: 'text',
    inputLabel: 'ชื่อแผนก (Department Name)',
    inputPlaceholder: 'เช่น การตลาด, ฝ่ายผลิต...',
    showCancelButton: true,
    confirmButtonText: 'บันทึก',
    cancelButtonText: 'ยกเลิก',
    preConfirm: (name) => {
      if (!name || !name.trim()) {
        Swal.showValidationMessage('กรุณาระบุชื่อแผนก');
      }
      return name.trim();
    }
  }).then((result) => {
    if (result.isConfirmed) {
      const nextId = 'D' + (appState.departments.length + 1).toString().padStart(3, '0');
      const newDept = {
        id: nextId,
        name: result.value,
        createdAt: new Date().toISOString()
      };
      appState.departments.push(newDept);
      saveData('departments');
      sendToCloud('saveDepartment', newDept);
      populateDepartmentSelects();
      renderDepartmentsTable();
      Swal.fire('สำเร็จ', `เพิ่มแผนก "${result.value}" เรียบร้อยแล้ว`, 'success');
    }
  });
}

function editDepartment(id) {
  const dept = appState.departments.find(d => d.id === id);
  if (!dept) return;

  Swal.fire({
    title: `แก้ไขแผนก (${dept.id})`,
    input: 'text',
    inputValue: dept.name,
    showCancelButton: true,
    confirmButtonText: 'บันทึก',
    cancelButtonText: 'ยกเลิก',
    preConfirm: (name) => {
      if (!name || !name.trim()) {
        Swal.showValidationMessage('กรุณาระบุชื่อแผนก');
      }
      return name.trim();
    }
  }).then((result) => {
    if (result.isConfirmed) {
      dept.name = result.value;
      saveData('departments');
      sendToCloud('saveDepartment', dept);
      populateDepartmentSelects();
      renderDepartmentsTable();
      Swal.fire('สำเร็จ', 'แก้ไขชื่อแผนกเรียบร้อยแล้ว', 'success');
    }
  });
}

function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  tbody.innerHTML = appState.users.map((u, idx) => `
    <tr class="hover:bg-blue-50/40 border-b border-slate-100 transition text-xs sm:text-sm">
      <td class="py-3 px-3 text-center text-slate-400 font-mono">${idx + 1}</td>
      <td class="py-3 px-3 font-mono text-slate-500">${u.id}</td>
      <td class="py-3 px-3">
        <div class="font-bold text-slate-800">${u.username}</div>
        <div class="text-xs text-slate-400 font-mono">••••••••</div>
      </td>
      <td class="py-3 px-3 font-medium text-slate-800">${u.fullName}</td>
      <td class="py-3 px-3">
        <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : u.role === 'technician' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}">
          ${getRoleBadgeText(u.role)}
        </span>
      </td>
      <td class="py-3 px-3 text-slate-600">${u.department || '-'}</td>
      <td class="py-3 px-3 text-center">
        <span class="px-2 py-0.5 rounded-full text-xs ${u.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">
          ${u.status === 'active' ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
        </span>
      </td>
      <td class="py-3 px-3 text-right">
        ${appState.currentUser && appState.currentUser.role === 'admin' ? `
          <button onclick="editUser('${u.id}')" class="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-lg">
            <i class="fa-solid fa-pen mr-1"></i> แก้ไข
          </button>
        ` : ''}
      </td>
    </tr>
  `).join('');
}

function openAddUserModal() {
  document.getElementById('userModalTitle').textContent = 'เพิ่มผู้ใช้งานระบบ (New User)';
  document.getElementById('userModalId').value = '';
  document.getElementById('userModalForm').reset();
  document.getElementById('userModalUsername').disabled = false;
  document.getElementById('userModal').classList.remove('hidden');
}

function editUser(userId) {
  const user = appState.users.find(u => u.id === userId);
  if (!user) return;

  document.getElementById('userModalTitle').textContent = `แก้ไขผู้ใช้งาน: ${user.username}`;
  document.getElementById('userModalId').value = user.id;
  document.getElementById('userModalUsername').value = user.username;
  document.getElementById('userModalUsername').disabled = true;
  document.getElementById('userModalPassword').value = user.password;
  document.getElementById('userModalFullName').value = user.fullName;
  document.getElementById('userModalRole').value = user.role;
  document.getElementById('userModalDept').value = user.department || '';
  document.getElementById('userModalStatus').value = user.status || 'active';

  document.getElementById('userModal').classList.remove('hidden');
}

function closeUserModal() {
  document.getElementById('userModal').classList.add('hidden');
}

function handleUserFormSubmit(event) {
  event.preventDefault();
  const editId = document.getElementById('userModalId').value;
  const username = document.getElementById('userModalUsername').value.trim();
  const password = document.getElementById('userModalPassword').value.trim();
  const fullName = document.getElementById('userModalFullName').value.trim();
  const role = document.getElementById('userModalRole').value;
  const department = document.getElementById('userModalDept').value;
  const status = document.getElementById('userModalStatus').value;

  if (!username || !password || !fullName) {
    Swal.fire('แจ้งเตือน', 'กรุณากรอกข้อมูลให้ครบถ้วน', 'warning');
    return;
  }

  if (editId) {
    const user = appState.users.find(u => u.id === editId);
    if (user) {
      user.password = password;
      user.fullName = fullName;
      user.role = role;
      user.department = department;
      user.status = status;
      sendToCloud('saveUser', user);
    }
  } else {
    if (appState.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      Swal.fire('ข้อผิดพลาด', 'ชื่อผู้ใช้งานนี้มีอยู่ในระบบแล้ว', 'error');
      return;
    }

    const newUser = {
      id: `USR${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}`,
      username: username,
      password: password,
      fullName: fullName,
      role: role,
      department: department,
      status: status,
      createdAt: new Date().toISOString()
    };
    appState.users.push(newUser);
    sendToCloud('saveUser', newUser);
  }

  saveData('users');
  closeUserModal();
  renderUsersTable();
  Swal.fire('สำเร็จ', 'บันทึกข้อมูลผู้ใช้เรียบร้อยแล้ว', 'success');
}

// =========================================================================
// 10. EXCEL EXPORT & BACKUP/RESTORE
// =========================================================================

function exportAssetsToExcel() {
  if (typeof XLSX === 'undefined') {
    Swal.fire('เกิดข้อผิดพลาด', 'ไม่พบไลบรารี SheetJS XLSX', 'error');
    return;
  }

  const exportData = appState.assets.map(a => ({
    'ID': a.id,
    'รหัสทรัพย์สิน (AssetCode)': a.assetCode,
    'ชื่ออุปกรณ์ (Name)': a.name,
    'หมวดหมู่ (Category)': a.category,
    'ยี่ห้อ (Brand)': a.brand,
    'รุ่น (Model)': a.model,
    'Serial Number': a.serialNumber,
    'แผนก (Department)': a.department,
    'สถานที่ตั้ง (Location)': a.location,
    'ผู้ครอบครอง (AssignedUser)': a.assignedUser,
    'วันที่ซื้อ': a.purchaseDate,
    'ราคา (บาท)': a.price,
    'สถานะ (Status)': a.status,
    'ลิงก์รูปภาพ (ImageUrl)': a.imageUrl,
    'หมายเหตุ (Notes)': a.notes,
    'วันที่สร้าง': a.createdAt,
    'วันที่อัปเดต': a.updatedAt
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Assets");

  const fileName = `IT_Assets_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);

  Swal.fire({
    icon: 'success',
    title: 'ส่งออกไฟล์ Excel สำเร็จ',
    text: `บันทึกไฟล์เป็น ${fileName}`,
    timer: 2000,
    showConfirmButton: false
  });
}

function exportRepairsToExcel() {
  if (typeof XLSX === 'undefined') {
    Swal.fire('เกิดข้อผิดพลาด', 'ไม่พบไลบรารี SheetJS XLSX', 'error');
    return;
  }

  const exportData = appState.repairs.map(r => ({
    'ID': r.id,
    'รหัสแจ้งซ่อม (RepairCode)': r.repairCode,
    'รหัสทรัพย์สิน (AssetCode)': r.assetCode,
    'ชื่ออุปกรณ์ (AssetName)': r.assetName,
    'ผู้แจ้งซ่อม (Reporter)': r.reporterName,
    'แผนก (Department)': r.department,
    'อาการเสีย (ProblemTitle)': r.problemTitle,
    'รายละเอียดปัญหา (ProblemDesc)': r.problemDesc,
    'สถานะ (Status)': r.status,
    'ช่างผู้รับผิดชอบ': r.technicianName,
    'วิธีแก้ไข (RepairDetails)': r.repairDetails,
    'ค่าใช้จ่าย (Cost)': r.cost,
    'วันที่แจ้งซ่อม': r.requestDate,
    'วันที่ดำเนินการ': r.repairDate,
    'วันที่ซ่อมเสร็จ': r.completedDate
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Repairs");

  const fileName = `IT_Repairs_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);

  Swal.fire({
    icon: 'success',
    title: 'ส่งออกประวัติการซ่อมสำเร็จ',
    text: `บันทึกไฟล์เป็น ${fileName}`,
    timer: 2000,
    showConfirmButton: false
  });
}

function exportDatabaseBackup() {
  const fullBackup = {
    settings: appState.settings,
    departments: appState.departments,
    users: appState.users,
    assets: appState.assets,
    repairs: appState.repairs,
    exportedAt: new Date().toISOString()
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fullBackup, null, 2));
  const dlAnchor = document.createElement('a');
  dlAnchor.setAttribute("href", dataStr);
  dlAnchor.setAttribute("download", `ams_backup_${new Date().toISOString().slice(0, 10)}.json`);
  dlAnchor.click();

  Swal.fire('สำเร็จ', 'ส่งออกไฟล์สำรองข้อมูล JSON เรียบร้อยแล้ว', 'success');
}

function importDatabaseBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (data.assets && data.repairs) {
        appState.assets = data.assets || [];
        appState.repairs = data.repairs || [];
        appState.departments = data.departments || appState.departments;
        appState.users = data.users || appState.users;
        appState.settings = data.settings || appState.settings;

        saveData();
        renderApp();
        Swal.fire('สำเร็จ', 'นำเข้าและกู้คืนข้อมูลสำเร็จแล้ว', 'success');
      } else {
        Swal.fire('เกิดข้อผิดพลาด', 'โครงสร้างไฟล์สำรองข้อมูลไม่ถูกต้อง', 'error');
      }
    } catch (err) {
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถอ่านไฟล์ JSON ได้: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

// =========================================================================
// 11. APP ENTRYPOINT & EVENT LISTENERS
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
  initDatabase();
  renderApp();
  if (appState.googleSheetUrl) {
    syncWithGoogleSheet(false);
  }
});
