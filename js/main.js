import { _supabase } from "./supabaseClient.js"; // 連線設定

// 【新增】全域變數：記錄當前使用者操作的群組 ID
let currentGroupId = null;
let currentUserId = null;
let currentUserDisplayName = '收藏家';

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', async () => {
        autoDetectMode();
        window.addEventListener('resize', debounceAutoDetectMode);
        checkUserSession();
        initInputFocusScroll(); // 綁定輸入框彈出鍵盤時自動捲動的功能
    });
}

async function checkUserSession() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        document.getElementById('authOverlay').style.display = 'none';
        
        await loadCurrentUserProfile();
        await fetchOrCreateUserGroup();
        fetchCollections();
    } else {
        document.getElementById('authOverlay').style.display = 'flex';
    }
}

async function loadCurrentUserProfile() {
    const { data: { user }, error } = await _supabase.auth.getUser();
    if (error || !user) {
        return;
    }

    currentUserId = user.id;
    currentUserDisplayName = user.user_metadata?.display_name
        || user.user_metadata?.full_name
        || user.user_metadata?.name
        || user.email
        || '收藏家';

    const greetingEl = document.getElementById('dashboard-greeting');
    if (greetingEl) {
        greetingEl.innerText = `哈囉，${currentUserDisplayName}！👋`;
    }
}

async function fetchOrCreateUserGroup() {
    // 1. 確保這裡有抓到使用者，且已經成功登入
    const { data: { user } } = await _supabase.auth.getUser();
    if (!user) {
        console.log('尚未登入，無法建立群組');
        return;
    }

    // 2. 先查詢使用者所屬的群組
    const { data: members, error } = await _supabase
        .from('group_members')
        .select('group_id, groups(name)')
        .eq('user_id', user.id);

    if (error) {
        console.error('取得群組失敗:', error);
        return;
    }

    if (members && members.length > 0) {
        currentGroupId = members[0].group_id;
        console.log('當前群組 ID:', currentGroupId);
    } else {
        console.log('偵測到無群組，正在透過 RPC 建立預設群組...');
        
        // 3. 呼叫 RPC
        const { data: newGroupId, error: rpcError } = await _supabase
            .rpc('create_default_group_for_user');

        if (rpcError) {
            alert('自動建立群組失敗: ' + rpcError.message);
            return;
        }

        currentGroupId = newGroupId;
        console.log('已自動建立並加入新群組 ID:', currentGroupId);
    }
}

// 綁登入事件
document.getElementById('loginBtn').addEventListener('click', handleLogin);

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
        
        await loadCurrentUserProfile();
        await fetchOrCreateUserGroup();
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

function buildMemberSummaries({ memberRows = [], itemsData = [], currentUserId = null, currentUserDisplayName = '收藏家' }) {
    const seenUserIds = new Set();

    if (Array.isArray(memberRows)) {
        memberRows.forEach(member => {
            if (member?.user_id) {
                seenUserIds.add(member.user_id);
            }
        });
    }

    if (Array.isArray(itemsData)) {
        itemsData.forEach(item => {
            if (item?.user_id) {
                seenUserIds.add(item.user_id);
            }
        });
    }

    return Array.from(seenUserIds).map(userId => {
        const memberItems = itemsData.filter(item => item.user_id === userId);
        const totalPrice = memberItems.reduce((sum, item) => sum + Number(item.price || 0), 0);
        const monthlyItems = memberItems.filter(item => isCurrentMonth(item.date || item.created_at || item.updated_at));
        const isCurrentUser = userId === currentUserId;

        return {
            userId,
            account: userId,
            displayName: isCurrentUser ? currentUserDisplayName : null,
            totalPrice,
            totalCount: memberItems.length,
            monthlyPrice: monthlyItems.reduce((sum, item) => sum + Number(item.price || 0), 0),
            monthlyCount: monthlyItems.length
        };
    }).sort((a, b) => {
        if (a.userId === currentUserId) return -1;
        if (b.userId === currentUserId) return 1;
        return a.userId.localeCompare(b.userId);
    });
}

// 同時從 items 與 transactions 撈取資料進行整合（已加上 group_id 過濾）
async function fetchCollections() {
    if (!currentGroupId) {
        document.getElementById('stat-db-status').innerText = '無群組 ⚠️';
        document.getElementById('stat-total-count').innerText = '0 件';
        document.getElementById('stat-total-price').innerText = formatCurrency(0);
        document.getElementById('stat-monthly-count').innerText = '0 件';
        document.getElementById('stat-monthly-price').innerText = formatCurrency(0);
        renderGroupMemberSummary([]);
        return;
    }

    try {
        // 1. 抓取 items（加上 group_id 限制）
        const { data: itemsData, error: itemsError } = await _supabase
            .from('items')
            .select('*')
            .eq('group_id', currentGroupId)
            .order('id', { ascending: false });

        if (itemsError) throw itemsError;

        // 2. 抓取 transactions（加上 group_id 限制）
        const { data: txData, error: txError } = await _supabase
            .from('transactions')
            .select('*')
            .eq('group_id', currentGroupId);

        if (txError) throw txError;

        // 3. 取得群組成員清單，並建立各帳號統計
        let memberSummaries = [];
        try {
            const { data: memberRows, error: memberError } = await _supabase
                .from('group_members')
                .select('user_id')
                .eq('group_id', currentGroupId);

            memberSummaries = buildMemberSummaries({
                memberRows: !memberError ? memberRows : [],
                itemsData,
                currentUserId,
                currentUserDisplayName
            });
        } catch (memberStatsError) {
            console.warn('取得群組成員統計失敗:', memberStatsError);
            memberSummaries = buildMemberSummaries({
                memberRows: [],
                itemsData,
                currentUserId,
                currentUserDisplayName
            });
        }

        // 將 transactions 根據 item_id 對應回去合併
        const combinedData = itemsData.map(item => {
            const itemTxs = txData.filter(tx => tx.item_id === item.id);
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
        renderData(combinedData, memberSummaries);
    } catch (err) {
        console.error('讀取失敗:', err);
        document.getElementById('stat-db-status').innerText = '連線失敗 ⚠️';
    }
}

let currentStatusFilter = 'all';

function formatCurrency(value) {
    return `NT$ ${Number(value || 0).toLocaleString()}`;
}

function getMonthKey(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function isCurrentMonth(value) {
    const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    return getMonthKey(value) === currentMonthKey;
}

function renderGroupMemberSummary(memberSummaries) {
    const container = document.getElementById('group-member-summary-list');
    if (!container) return;

    if (!memberSummaries || memberSummaries.length === 0) {
        container.innerHTML = '<div class="group-summary-empty">目前這個群組還沒有成員資料。</div>';
        return;
    }

    container.innerHTML = memberSummaries.map(summary => {
        const accountLabel = summary.displayName
            ? (summary.userId === currentUserId ? `你・${summary.displayName}` : summary.displayName)
            : (summary.account ? `帳號 ${summary.account.slice(0, 8)}${summary.account.length > 8 ? '...' : ''}` : '未知帳號');
        return `
            <div class="group-summary-row">
                <div class="group-summary-account">${accountLabel}</div>
                <div class="group-summary-values">
                    <div class="group-summary-pill">
                        <div class="label">總花費</div>
                        <div class="value">${formatCurrency(summary.totalPrice)}</div>
                    </div>
                    <div class="group-summary-pill">
                        <div class="label">總收集</div>
                        <div class="value">${summary.totalCount} 件</div>
                    </div>
                    <div class="group-summary-pill">
                        <div class="label">當月總花費</div>
                        <div class="value">${formatCurrency(summary.monthlyPrice)}</div>
                    </div>
                    <div class="group-summary-pill">
                        <div class="label">當月總收集</div>
                        <div class="value">${summary.monthlyCount} 件</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderData(items, memberSummaries = []) {
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

    const monthlyItems = items.filter(item => isCurrentMonth(item.date || item.created_at || item.updated_at));
    const monthlyCount = monthlyItems.length;
    const monthlyPrice = monthlyItems.reduce((sum, item) => sum + Number(item.price || 0), 0);

    if (filteredItems.length === 0) {
        container.innerHTML = '<div style="color: var(--text-sub); grid-column: 1 / -1; text-align: center; padding: 40px;">目前還沒有符合條件的收藏品喔！</div>';
    } else {
        filteredItems.forEach(item => {
            html += buildCollectionCard(item);
        });
        container.innerHTML = html;
    }

    document.getElementById('stat-total-count').innerText = `${totalCount} 件`;
    document.getElementById('stat-total-price').innerText = formatCurrency(totalPrice);
    document.getElementById('stat-monthly-count').innerText = `${monthlyCount} 件`;
    document.getElementById('stat-monthly-price').innerText = formatCurrency(monthlyPrice);

    const budgetLimit = 6000;
    const percent = Math.min(Math.round((totalPrice / budgetLimit) * 100), 100);
    const budgetDescEl = document.getElementById('budget-desc');
    const budgetBarEl = document.getElementById('budget-bar');

    if (budgetDescEl) {
        budgetDescEl.innerText = `已花費 ${formatCurrency(totalPrice)} / 預算 ${formatCurrency(budgetLimit)} (${percent}%)`;
    }

    if (budgetBarEl) {
        budgetBarEl.style.width = percent + '%';
    }

    renderGroupMemberSummary(memberSummaries);
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

/* 新增品項：同時寫入 items 與 transactions 雙表（已自動帶入 user_id 與 group_id） */
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

    if (!currentGroupId) {
        alert('尚未設定群組，無法新增！');
        return;
    }

    // 取得當前登入使用者的 UID
    const { data: { user } } = await _supabase.auth.getUser();
    if (!user) {
        alert('尚未登入或登入已過期，請重新登入！');
        location.reload();
        return;
    }
    const userId = user.id;

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

    // 1. 寫入 items 資料表 (帶入 user_id 與 group_id)
    const { data: insertedItem, error: itemError } = await _supabase
        .from('items')
        .insert([{
            title: titleInput,
            category: categoryInput || '一般',
            tag: tagInput || '收藏品',
            date: dateInput || null,
            price: Number(priceInput) || 0,
            image_url: imageUrl,
            notes: notesInput || '',
            user_id: userId,
            group_id: currentGroupId // 【群組核心】
        }])
        .select()
        .single();

    if (itemError) {
        alert('主品項新增失敗: ' + itemError.message);
        return;
    }

    const newItemId = insertedItem.id;

    // 2. 如果狀態是已售出，寫入 transactions 資料表 (帶入 user_id 與 group_id)
    if (statusInput === 'sold') {
        const { error: txError } = await _supabase
            .from('transactions')
            .insert([{
                item_id: newItemId,
                type: 'sold',
                price: Number(sellPriceInput) || 0,
                date: sellDateInput || null,
                user_id: userId,
                group_id: currentGroupId // 【群組核心】
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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        buildMemberSummaries
    };
}