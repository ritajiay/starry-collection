const SUPABASE_URL = 'https://wpxrncmhaiwkohegbxdv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_AR7Pmd0Z3uXENSiyFCXHig_tRJQUgIB';

const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.addEventListener('DOMContentLoaded', async () => {
    autoDetectMode();
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

// 1. 在外面宣告一個變數記錄目前選中的標籤
let currentTag = '全部';

function renderData(items) {
    const cardsContainer = document.getElementById('cards-grid-container');
    const goodsContainer = document.getElementById('goods-grid-container');
    
    cardsContainer.innerHTML = '';
    goodsContainer.innerHTML = '';

    // 【新增】動態產生與渲染標籤篩選按鈕列
    renderTagButtons(items);

    // 【修改】根據目前選中的標籤過濾 items
    const filteredItems = items.filter(item => {
        if (currentTag === '全部') return true;
        const tag = item.tag || '收藏品';
        return tag === currentTag;
    });

    let totalCount = filteredItems.length; // 依照篩選後計算數量（如果想維持總數量可改回 items.length）
    let totalPrice = 0;
    let cardHtml = '';
    let goodsHtml = '';

    // 使用過濾後的資料來跑迴圈
    filteredItems.forEach(item => {
        totalPrice += Number(item.price || 0);
        const tag = item.tag || '收藏品';
        const title = item.title || '無標題';
        const date = item.date || '2026-12-21';
        const price = item.price ? `NT$ ${Number(item.price).toLocaleString()}` : '未定';
        const notes = item.notes || '';

        const imageContent = item.image_url 
            ? `<img src="${item.image_url}" alt="${title}">` 
            : (item.image_emoji || '✨');

        const cardTemplate = `
            <div class="collection-card">
                <div class="card-img-container">${imageContent}</div>
                <div class="card-info">
                    <span class="card-tag">${tag}</span>
                    <div class="card-title">${title}</div>
                    <div class="card-date">購入日期: ${date}</div>
                    <div class="card-price">購入: ${price}</div>
                    <div class="card-notes">備註: ${notes}</div>
                </div>
            </div>
        `;

        if (item.category === 'card') {
            cardHtml += cardTemplate;
        } else {
            goodsHtml += cardTemplate;
        }
    });

    cardsContainer.innerHTML = cardHtml || '<div style="color: var(--text-sub);">目前還沒有符合的卡片收藏喔！</div>';
    goodsContainer.innerHTML = goodsHtml || '<div style="color: var(--text-sub);">目前還沒有符合的周邊收藏喔！</div>';

    document.getElementById('stat-total-count').innerText = `${totalCount} 件`;
    document.getElementById('stat-total-price').innerText = `NT$ ${totalPrice.toLocaleString()}`;

    const budgetLimit = 6000;
    const percent = Math.min(Math.round((totalPrice / budgetLimit) * 100), 100);
    document.getElementById('budget-desc').innerText = `已花費 NT$ ${totalPrice.toLocaleString()} / 預算 NT$ ${budgetLimit.toLocaleString()} (${percent}%)`;
    document.getElementById('budget-bar').style.width = percent + '%';
}

/**
 * 【新增】專門負責產生上方標籤按鈕的輔助函式
 */
function renderTagButtons(items) {
    let tagContainer = document.getElementById('tag-filter-container');
    
    // 如果 HTML 中還沒有這個容器，自動幫你在適當地方建立一個（或請自行加在 HTML 中）
    if (!tagContainer) {
        tagContainer = document.createElement('div');
        tagContainer.id = 'tag-filter-container';
        tagContainer.style.marginBottom = '20px';
        const cardsContainer = document.getElementById('cards-grid-container');
        cardsContainer.parentNode.insertBefore(tagContainer, cardsContainer);
    }

    // 從所有 items 中萃取出不重複的 tag，並加上「全部」
    const tags = ['全部', ...new Set(items.map(item => item.tag || '收藏品'))];

    tagContainer.innerHTML = tags.map(tag => `
        <button class="filter-tag-btn ${tag === currentTag ? 'active' : ''}" data-tag="${tag}" style="margin-right: 8px; padding: 6px 14px; border-radius: 16px; border: 1px solid #ddd; cursor: pointer; background: ${tag === currentTag ? 'var(--primary-color, #007bff)' : '#fff'}; color: ${tag === currentTag ? '#fff' : '#333'}">
            ${tag}
        </button>
    `).join('');

    // 綁點擊事件：點擊後更新狀態並重新渲染資料
    tagContainer.querySelectorAll('.filter-tag-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentTag = e.target.getAttribute('data-tag');
            // 假設你的原始資料全域變數叫做 allItems，請換成你實際儲存資料的變數名稱
            renderData(window.allItems || items); 
        });
    });
}

/* Modal 互動開關控制 */
function openModal() {
    document.getElementById('uploadModal').style.display = 'flex';
}
function closeModal() {
    document.getElementById('uploadModal').style.display = 'none';
}

/* 將舊的 prompt 換成上傳檔案並存進 Supabase Storage 與資料庫 */
async function submitNewItem() {
    const titleInput = document.getElementById('inputTitle').value.trim();
    const categoryInput = document.getElementById('inputCategory').value;
    const tagInput = document.getElementById('inputTag').value.trim();
    const dateInput = document.getElementById('inputDate').value;
    const priceInput = document.getElementById('inputPrice').value;
    const notesInput = document.getElementById('inputNotes').value.trim();
    const fileInput = document.getElementById('inputFile');
    const file = fileInput.files[0];

    if (!titleInput) {
        alert('請輸入收藏名稱！');
        return;
    }

    let imageUrl = null;

    // 如果使用者有選擇圖片，先執行 Storage 上傳
    if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `uploads/${fileName}`;

        // 上傳到 Supabase Storage (請確保在後台建立名為 collection-images 的 bucket)
        const { data: uploadData, error: uploadError } = await _supabase.storage
            .from('collection-images')
            .upload(filePath, file);

        if (uploadError) {
            alert('圖片上傳失敗: ' + uploadError.message);
            return;
        }

        // 取得公開網址
        const { data: publicUrlData } = _supabase.storage
            .from('collection-images')
            .getPublicUrl(filePath);

        imageUrl = publicUrlData.publicUrl;
    }

    // 將資料寫入 collections 資料表 (包含 image_url)
    const { error } = await _supabase
        .from('collections')
        .insert([
            { 
                title: titleInput, 
                category: categoryInput, 
                tag: tagInput || '收藏品', 
                date: dateInput || '2026-12-21',
                price: Number(priceInput) || 0, 
                image_url: imageUrl,
                image_emoji: categoryInput === 'goods' ? '🧸' : '🌟' ,
                notes: notesInput || ''
            }
        ]);

    if (error) {
        alert('資料新增失敗: ' + error.message);
    } else {
        alert('成功新增品項與照片到雲端！✨');
        closeModal();
        // 清空表單
        document.getElementById('inputTitle').value = '';
        document.getElementById('inputTag').value = '';
        document.getElementById('inputDate').value = '';
        document.getElementById('inputPrice').value = '';
        document.getElementById('inputNotes').value = '';
        fileInput.value = '';
        fetchCollections();
    }
}

function switchMode(mode) {
    const container = document.getElementById('appContainer');
    const btns = document.querySelectorAll('.mode-btn');
    
    btns.forEach(btn => btn.classList.remove('active'));
    
    if (mode === 'web') {
        container.className = 'app-container web-mode';
        if(btns[0]) btns[0].classList.add('active');
    } else {
        container.className = 'app-container mobile-mode';
        if(btns[1]) btns[1].classList.add('active');
    }
}

function switchTab(tabId, element) {
    const pages = document.querySelectorAll('.page-pane');
    pages.forEach(page => page.classList.remove('active'));
    
    document.getElementById('page-' + tabId).classList.add('active');

    const navItems = document.querySelectorAll('.sidebar .nav-item');
    navItems.forEach(item => item.classList.remove('active'));
    
    const mobileTabs = document.querySelectorAll('.mobile-tabbar .mobile-tab-item');
    mobileTabs.forEach(item => {
        if(!item.getAttribute('onclick').includes("switchMode")) {
            item.classList.remove('active');
        }
    });

    if (element.classList.contains('nav-item')) {
        element.classList.add('active');
        const index = Array.from(navItems).indexOf(element);
        if (index !== -1 && mobileTabs[index]) {
            mobileTabs[index].classList.add('active');
        }
    } else if (element.classList.contains('mobile-tab-item') && !element.getAttribute('onclick').includes("switchMode")) {
        element.classList.add('active');
        const index = Array.from(mobileTabs).indexOf(element);
        if (index !== -1 && navItems[index]) {
            navItems[index].classList.add('active');
        }
    }
}