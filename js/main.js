const SUPABASE_URL = 'https://wpxrncmhaiwkohegbxdv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_AR7Pmd0Z3uXENSiyFCXHig_tRJQUgIB';

const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.addEventListener('DOMContentLoaded', async () => {
    autoDetectMode();
    window.addEventListener('resize', debounceAutoDetectMode);
    checkUserSession();
});

async function checkUserSession() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        document.getElementById('authOverlay').style.display = 'none';
        fetchCollections();
    } else {
        document.getElementById('authOverlay').style.display = 'flex';
    }
}

async function handleLogin() {
    const email = document.getElementById('emailInput').value.trim();
    const password = document.getElementById('passwordInput').value.trim();
    const msgEl = document.getElementById('authMessage');

    if (!email || !password) {
        msgEl.innerText = '請輸入 Email 與密碼';
        return;
    }

    msgEl.innerText = '登入中...';

    const { data, error } = await _supabase.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        msgEl.innerText = '登入失敗: ' + error.message;
    } else {
        msgEl.innerText = '';
        document.getElementById('authOverlay').style.display = 'none';
        fetchCollections();
    }
}

async function handleLogout() {
    await _supabase.auth.signOut();
    location.reload();
}

let resizeTimer = null;

function debounceAutoDetectMode() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
        autoDetectMode();
    }, 120);
}

function autoDetectMode() {
    if (window.innerWidth <= 768) {
        switchMode('mobile');
    } else {
        switchMode('web');
    }
}

async function fetchCollections() {
    try {
        const { data, error } = await _supabase
            .from('collections')
            .select('*')
            .order('id', { ascending: false });

        if (error) throw error;

        document.getElementById('stat-db-status').innerText = '連線正常 ✨';
        renderData(data);
    } catch (err) {
        console.error('讀取失敗:', err);
        document.getElementById('stat-db-status').innerText = '連線失敗 ⚠️';
    }
}

// 記錄目前的篩選狀態 ('all', 'holding', 'sold')
let currentStatusFilter = 'all';

function renderData(items) {
    const container = document.getElementById('collection-grid-container');
    window.allItems = items;

    container.innerHTML = '';

    // 根據狀態進行篩選
    const filteredItems = items.filter(item => {
        const status = item.status || 'holding';
        if (currentStatusFilter === 'all') return true;
        return status === currentStatusFilter;
    });

    let totalCount = items.length;
    let totalPrice = 0;
    let html = '';

    items.forEach(item => {
        totalPrice += Number(item.price || 0);
    });

    if (filteredItems.length === 0) {
        container.innerHTML = '<div style="color: var(--text-sub); grid-column: 1 / -1; text-align: center; padding: 40px;">目前還沒有符合條件的收藏品喔！</div>';
    } else {
        filteredItems.forEach(item => {
            html += buildCollectionCard(item);
        });
        container.innerHTML = html;
    }

    // 更新儀表板數據
    document.getElementById('stat-total-count').innerText = `${totalCount} 件`;
    document.getElementById('stat-total-price').innerText = `NT$ ${totalPrice.toLocaleString()}`;

    const budgetLimit = 6000;
    const percent = Math.min(Math.round((totalPrice / budgetLimit) * 100), 100);
    document.getElementById('budget-desc').innerText = `已花費 NT$ ${totalPrice.toLocaleString()} / 預算 NT$ ${budgetLimit.toLocaleString()} (${percent}%)`;
    document.getElementById('budget-bar').style.width = percent + '%';
}

// 切換收藏庫篩選器 (全部 / 持有中 / 已售出)
function filterCollection(status) {
    currentStatusFilter = status;
    if (window.allItems) {
        renderData(window.allItems);
    }
}

function buildCollectionCard(item) {
    const tag = item.tag || '收藏品';
    const title = item.title || '無標題';
    const date = item.date || '未填';
    const price = item.price ? `NT$ ${Number(item.price).toLocaleString()}` : 'NT$ 0';
    const notes = item.notes || '';
    const status = item.status || 'holding';
    
    const imageContent = item.image_url
        ? `<img src="${item.image_url}" alt="${title}">`
        : '✨';

    // 狀態標籤與買賣明細渲染
    let statusBadge = '';
    let tradeDetails = '';

    if (status === 'sold') {
        statusBadge = `<span style="background: #e74c3c; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">已售出</span>`;
        const sellPrice = Number(item.sell_price || 0);
        const buyPrice = Number(item.price || 0);
        const profit = sellPrice - buyPrice;
        const profitClass = profit >= 0 ? 'color: #27ae60;' : 'color: #c0392b;';
        const profitText = profit >= 0 ? `+$${profit.toLocaleString()}` : `-$${Math.abs(profit).toLocaleString()}`;

        tradeDetails = `
            <div style="margin-top: 6px; font-size: 0.85rem; border-top: 1px dashed #eee; padding-top: 6px;">
                <div>售出: NT$ ${sellPrice.toLocaleString()}</div>
                <div style="font-weight: 700; ${profitClass}">損益: ${profitText}</div>
            </div>
        `;
    } else {
        statusBadge = `<span style="background: #27ae60; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">持有中</span>`;
    }

    return `
        <div class="collection-card" style="background: #fff; border-radius: 12px; overflow: hidden; border: 1px solid var(--border-color); display: flex; flex-direction: column;">
            <div class="card-img-container" style="height: 160px; background: #f9f9f9; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative;">
                ${imageContent}
                <div style="position: absolute; top: 8px; right: 8px;">${statusBadge}</div>
            </div>
            <div class="card-info" style="padding: 14px; display: flex; flex-direction: column; gap: 4px; flex-grow: 1;">
                <span class="card-tag" style="font-size: 0.75rem; color: var(--primary); font-weight: 700;">${tag}</span>
                <div class="card-title" style="font-weight: 700; font-size: 1rem; margin-bottom: 4px;">${title}</div>
                <div class="card-date" style="font-size: 0.8rem; color: var(--text-sub);">購入日期: ${date}</div>
                <div class="card-price" style="font-size: 0.85rem; font-weight: 500;">購入: ${price}</div>
                ${tradeDetails}
                ${notes ? `<div class="card-notes" style="font-size: 0.8rem; color: var(--text-sub); margin-top: 4px;">備註: ${notes}</div>` : ''}
            </div>
        </div>
    `;
}

/* Modal 互動開關控制 */
function openModal() {
    document.getElementById('uploadModal').style.display = 'flex';
}
function closeModal() {
    document.getElementById('uploadModal').style.display = 'none';
}

/* 新增品項並寫入 Supabase 資料庫 */
async function submitNewItem() {
    const titleInput = document.getElementById('inputTitle').value.trim();
    const categoryInput = document.getElementById('inputCategory').value.trim();
    const tagInput = document.getElementById('inputTag').value.trim();
    const statusInput = document.getElementById('inputStatus').value;
    const dateInput = document.getElementById('inputDate').value;
    const priceInput = document.getElementById('inputPrice').value;
    
    // 售出相關欄位
    const sellPriceInput = document.getElementById('inputSellPrice').value;
    const sellDateInput = document.getElementById('inputSellDate').value;

    const notesInput = document.getElementById('inputNotes').value.trim();
    const fileInput = document.getElementById('inputFile');
    const file = fileInput.files[0];

    if (!titleInput) {
        alert('請輸入收藏名稱！');
        return;
    }

    let imageUrl = null;

    if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `uploads/${fileName}`;

        const { data: uploadData, error: uploadError } = await _supabase.storage
            .from('collection-images')
            .upload(filePath, file);

        if (uploadError) {
            alert('圖片上傳失敗: ' + uploadError.message);
            return;
        }

        const { data: publicUrlData } = _supabase.storage
            .from('collection-images')
            .getPublicUrl(filePath);

        imageUrl = publicUrlData.publicUrl;
    }

    // 準備寫入資料庫的物件
    const insertData = {
        title: titleInput,
        category: categoryInput || '一般',
        tag: tagInput || '收藏品',
        status: statusInput,
        date: dateInput || null,
        price: Number(priceInput) || 0,
        image_url: imageUrl,
        notes: notesInput || ''
    };

    // 如果狀態是已售出，把售出金額與日期也加進去
    if (statusInput === 'sold') {
        insertData.sell_price = Number(sellPriceInput) || 0;
        insertData.sell_date = sellDateInput || null;
    }

    const { error } = await _supabase
        .from('collections')
        .insert([insertData]);

    if (error) {
        alert('資料新增失敗: ' + error.message);
    } else {
        alert('成功新增品項到雲端！✨');
        closeModal();
        
        // 清空表單
        document.getElementById('inputTitle').value = '';
        document.getElementById('inputCategory').value = '';
        document.getElementById('inputTag').value = '';
        document.getElementById('inputPrice').value = '';
        document.getElementById('inputDate').value = '';
        document.getElementById('inputSellPrice').value = '';
        document.getElementById('inputSellDate').value = '';
        document.getElementById('inputNotes').value = '';
        document.getElementById('inputStatus').value = 'holding';
        document.getElementById('soldFieldsContainer').style.display = 'none';
        fileInput.value = '';

        fetchCollections();
    }
}

let sidebarCollapsed = false;

function switchMode(mode) {
    const container = document.getElementById('appContainer');

    if (mode === 'web') {
        container.className = 'app-container web-mode';
        document.querySelector('.sidebar')?.classList.toggle('collapsed', sidebarCollapsed);
    } else {
        container.className = 'app-container mobile-mode';
        document.querySelector('.sidebar')?.classList.remove('collapsed');
    }
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.querySelector('.sidebar-toggle-btn');

    if (!sidebar || !toggleBtn) return;

    sidebarCollapsed = !sidebarCollapsed;
    sidebar.classList.toggle('collapsed', sidebarCollapsed);
    toggleBtn.innerText = sidebarCollapsed ? '⟩' : '⟨';
    toggleBtn.setAttribute('aria-label', sidebarCollapsed ? '展開側邊欄' : '收合側邊欄');
}

function switchTab(tabId, element) {
    const pages = document.querySelectorAll('.page-pane');
    pages.forEach(page => page.classList.remove('active'));
    
    document.getElementById('page-' + tabId).classList.add('active');

    const navItems = document.querySelectorAll('.sidebar .nav-item');
    navItems.forEach(item => item.classList.remove('active'));
    
    const mobileTabs = document.querySelectorAll('.mobile-tabbar .mobile-tab-item');
    mobileTabs.forEach(item => item.classList.remove('active'));

    if (element.classList.contains('nav-item')) {
        element.classList.add('active');
        const index = Array.from(navItems).indexOf(element);
        if (index !== -1 && mobileTabs[index]) {
            mobileTabs[index].classList.add('active');
        }
    } else if (element.classList.contains('mobile-tab-item')) {
        element.classList.add('active');
        const index = Array.from(mobileTabs).indexOf(element);
        if (index !== -1 && navItems[index]) {
            navItems[index].classList.add('active');
        }
    }
}