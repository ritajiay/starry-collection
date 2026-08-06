const SUPABASE_URL = 'https://wpxrncmhaiwkohegbxdv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_AR7Pmd0Z3uXENSiyFCXHig_tRJQUgIB';

const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.addEventListener('DOMContentLoaded', async () => {
    autoDetectMode();
    window.addEventListener('resize', debounceAutoDetectMode);
    checkUserSession();
    initInputFocusScroll(); // 綁定輸入框彈出鍵盤時自動捲動的功能
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

// 同時從 items 與 transactions 撈取資料進行整合
async function fetchCollections() {
    try {
        // 1. 抓取 items
        const { data: itemsData, error: itemsError } = await _supabase
            .from('items')
            .select('*')
            .order('id', { ascending: false });

        if (itemsError) throw itemsError;

        // 2. 抓取 transactions
        const { data: txData, error: txError } = await _supabase
            .from('transactions')
            .select('*');

        if (txError) throw txError;

        // 將 transactions 根據 item_id 對應回去合併
        const combinedData = itemsData.map(item => {
            const itemTxs = txData.filter(tx => tx.item_id === item.id);
            // 找出是否有售出紀錄
            const soldTx = itemTxs.find(tx => tx.type === 'sold' || tx.status === 'sold');
            return {
                ...item,
                transactions: itemTxs,
                status: soldTx ? 'sold' : 'holding',
                sell_price: soldTx ? soldTx.price : null,
                sell_date: soldTx ? soldTx.date : null
            };
        });

        document.getElementById('stat-db-status').innerText = '連線正常 ✨';
        renderData(combinedData);
    } catch (err) {
        console.error('讀取失敗:', err);
        document.getElementById('stat-db-status').innerText = '連線失敗 ⚠️';
    }
}

let currentStatusFilter = 'all';

function renderData(items) {
    const container = document.getElementById('collection-grid-container');
    window.allItems = items;

    container.innerHTML = '';

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

    document.getElementById('stat-total-count').innerText = `${totalCount} 件`;
    document.getElementById('stat-total-price').innerText = `NT$ ${totalPrice.toLocaleString()}`;

    const budgetLimit = 6000;
    const percent = Math.min(Math.round((totalPrice / budgetLimit) * 100), 100);
    document.getElementById('budget-desc').innerText = `已花費 NT$ ${totalPrice.toLocaleString()} / 預算 NT$ ${budgetLimit.toLocaleString()} (${percent}%)`;
    document.getElementById('budget-bar').style.width = percent + '%';
}

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
        <div class="collection-card">
            <div class="card-img-container">
                ${imageContent}
                <div style="position: absolute; top: 8px; right: 8px; z-index: 2;">${statusBadge}</div>
            </div>
            <div class="card-info">
                <span class="card-tag">${tag}</span>
                <div class="card-title">${title}</div>
                <div class="card-date">購入日期: ${date}</div>
                <div class="card-price">購入: ${price}</div>
                ${tradeDetails}
                ${notes ? `<div class="card-notes">備註: ${notes}</div>` : ''}
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

/* 新增品項：同時寫入 items 與 transactions 雙表 */
async function submitNewItem() {
    const titleInput = document.getElementById('inputTitle').value.trim();
    const categoryInput = document.getElementById('inputCategory').value.trim();
    const tagInput = document.getElementById('inputTag').value.trim();
    const statusInput = document.getElementById('inputStatus').value;
    const dateInput = document.getElementById('inputDate').value;
    const priceInput = document.getElementById('inputPrice').value;
    
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

    // 1. 寫入 items 資料表
    const { data: insertedItem, error: itemError } = await _supabase
        .from('items')
        .insert([{
            title: titleInput,
            category: categoryInput || '一般',
            tag: tagInput || '收藏品',
            date: dateInput || null,
            price: Number(priceInput) || 0,
            image_url: imageUrl,
            notes: notesInput || ''
        }])
        .select()
        .single();

    if (itemError) {
        alert('主品項新增失敗: ' + itemError.message);
        return;
    }

    const newItemId = insertedItem.id;

    // 2. 如果狀態是已售出，寫入 transactions 資料表
    if (statusInput === 'sold') {
        const { error: txError } = await _supabase
            .from('transactions')
            .insert([{
                item_id: newItemId,
                type: 'sold',
                price: Number(sellPriceInput) || 0,
                date: sellDateInput || null
            }]);

        if (txError) {
            alert('交易紀錄寫入失敗: ' + txError.message);
        }
    }

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

//手機點擊 input 自動滾動到畫面中央的 Focus 功能
function initInputFocusScroll() {
    const inputs = document.querySelectorAll('#uploadModal input, #uploadModal select');
    inputs.forEach(input => {
        input.addEventListener('focus', function() {
            setTimeout(() => {
                this.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                });
            }, 300);
        });
    });
}