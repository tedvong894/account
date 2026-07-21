// 主程序：页面渲染 + 交互
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const state = {
    view: 'record',
    ledgerId: null,
    month: null,
    ledgers: [],
    categories: [],
    unsubs: []
  };

  // ---------- 工具 ----------
  function fmt(n) {
    const v = Number(n) || 0;
    return '¥' + v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function monthKeyOf(d) {
    const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  function todayStr() { return Store.todayStr(); }
  function catMap() { const m = {}; state.categories.forEach(c => m[c.id] = c); return m; }
  function assetMap() { const m = {}; (state.assets || []).forEach(a => m[a.id] = a); return m; }

  function toast(msg) {
    const root = $('#toast-root');
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 250); }, 1800);
  }

  // ---------- 数据加载 ----------
  async function reloadCaches() {
    state.ledgers = await Store.getLedgers();
    state.categories = await Store.getCategories();
    state.assets = await Store.getAssets();
    if (!state.ledgerId && state.ledgers[0]) state.ledgerId = state.ledgers[0].id;
    const savedMonth = localStorage.getItem('yy_current_month');
    if (!state.month) state.month = savedMonth || monthKeyOf(new Date());
  }

  // ---------- 弹窗基础 ----------
  function openModal(panelHTML) {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-mask"></div><div class="modal-panel">${panelHTML}</div>`;
    root.classList.add('show');
    $('.modal-mask', root).addEventListener('click', closeModal);
  }
  function closeModal() {
    const root = $('#modal-root');
    root.classList.remove('show');
    root.innerHTML = '';
  }

  // ---------- 顶部栏 ----------
  async function renderHeader() {
    $('#header-month').textContent = state.month;

    const txs = await Store.getTransactions({ ledgerId: state.ledgerId, month: state.month });
    let exp = 0, inc = 0;
    txs.forEach(t => { if (t.type === 'expense') exp += Number(t.amount); else inc += Number(t.amount); });
    $('#header-expense').textContent = fmt(exp);
    $('#header-income').textContent = fmt(inc);
    $('#header-balance').textContent = fmt(inc - exp);
  }

  // ---------- 记账页 ----------
  async function renderRecord() {
    const view = $('#view-record');
    const expCats = state.categories.filter(c => c.type === 'expense');
    const txs = await Store.getTransactions({ ledgerId: state.ledgerId, month: state.month });
    const cm = catMap();
    const recent = txs.slice(0, 5);

    view.innerHTML = `
      <div class="card">
        <div class="card-title">快捷记一笔 <span class="more" id="go-detail">查看明细 ›</span></div>
        <div class="quick-grid">
          ${expCats.map(c => `
            <div class="quick-item" data-cat="${c.id}">
              <div class="quick-icon" style="background:${c.color}22">${c.icon}</div>
              <div class="quick-name">${esc(c.name)}</div>
            </div>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-title">最近记录</div>
        ${recent.length ? recent.map(t => txRow(t, cm)).join('') : '<div class="empty">本月还没有记录，点下方 ＋ 记一笔吧</div>'}
      </div>`;

    $$('#view-record .quick-item').forEach(el => {
      el.addEventListener('click', () => {
        const cat = state.categories.find(c => c.id === el.dataset.cat);
        openAddModal(cat);
      });
    });
    const gd = $('#go-detail'); if (gd) gd.addEventListener('click', () => switchView('detail'));
  }

  function txRow(t, cm) {
    const c = t.category_id ? cm[t.category_id] : null;
    const am = assetMap();
    const a = t.asset_id ? am[t.asset_id] : null;
    const sign = t.type === 'expense' ? '-' : '+';
    const sub = `${a ? a.icon + ' ' + esc(a.name) + '　' : ''}${esc(t.note || t.occurred_at)}`;
    return `<div class="tx-item" data-id="${t.id}">
      <div class="tx-icon" style="background:${(c ? c.color : '#999')}22">${c ? c.icon : '📦'}</div>
      <div class="tx-main">
        <div class="tx-cat">${esc(c ? c.name : '未分类')}</div>
        <div class="tx-note">${sub}</div>
      </div>
      <div class="tx-amount ${t.type}">${sign}${fmt(t.amount).slice(1)}</div>
    </div>`;
  }

  // ---------- 明细页 ----------
  async function renderDetail() {
    const view = $('#view-detail');
    const cm = catMap();
    let txs = await Store.getTransactions({ ledgerId: state.ledgerId, month: state.month });

    // 按日期分组
    const groups = {};
    txs.forEach(t => { (groups[t.occurred_at] = groups[t.occurred_at] || []).push(t); });
    const dates = Object.keys(groups).sort().reverse();

    view.innerHTML = `
      <div class="card" style="padding:10px 14px">
        <input id="search-box" placeholder="🔍 搜索备注 / 分类" style="width:100%;border:none;outline:none;font-size:14px;background:none" />
        <div style="display:flex;gap:8px;margin-top:10px" id="type-filter">
          ${['all', 'expense', 'income'].map(t => `<button data-t="${t}" class="type-chip${t === 'all' ? ' active' : ''}" style="flex:1;padding:6px;border:1px solid var(--line);border-radius:10px;background:${t === 'all' ? 'var(--primary)' : '#fff'};color:${t === 'all' ? '#fff' : 'var(--text-sub)'};font-weight:600;cursor:pointer">${t === 'all' ? '全部' : (t === 'expense' ? '支出' : '收入')}</button>`).join('')}
        </div>
      </div>
      <div id="detail-list">
        ${dates.length ? dates.map(d => {
          const items = groups[d];
          const sumE = items.filter(x => x.type === 'expense').reduce((s, x) => s + Number(x.amount), 0);
          const sumI = items.filter(x => x.type === 'income').reduce((s, x) => s + Number(x.amount), 0);
          return `<div class="tx-group-title"><span>${d}</span><span>收 ${fmt(sumI)} · 支 ${fmt(sumE)}</span></div>` +
            items.map(t => txRow(t, cm)).join('');
        }).join('') : '<div class="empty">本月暂无记录</div>'}
      </div>`;

    // 搜索
    const sb = $('#search-box');
    sb.addEventListener('input', () => filterDetail(groups, cm, sb.value.trim(), currentType));
    // 类型筛选
    let currentType = 'all';
    $$('#type-filter button').forEach(b => b.addEventListener('click', () => {
      currentType = b.dataset.t;
      $$('#type-filter button').forEach(x => {
        const on = x === b;
        x.style.background = on ? 'var(--primary)' : '#fff';
        x.style.color = on ? '#fff' : 'var(--text-sub)';
      });
      filterDetail(groups, cm, sb.value.trim(), currentType);
    }));
    // 点击删除
    bindTxDelete(view);
  }

  function filterDetail(groups, cm, kw, type) {
    const dates = Object.keys(groups).sort().reverse();
    const list = $('#detail-list');
    const filtered = {};
    dates.forEach(d => {
      filtered[d] = groups[d].filter(t => {
        const c = t.category_id ? cm[t.category_id] : null;
        const okT = type === 'all' || t.type === type;
        const okK = !kw || (c && c.name.includes(kw)) || (t.note && t.note.includes(kw));
        return okT && okK;
      });
    });
    const out = dates.filter(d => filtered[d].length).map(d => {
      const items = filtered[d];
      const sumE = items.filter(x => x.type === 'expense').reduce((s, x) => s + Number(x.amount), 0);
      const sumI = items.filter(x => x.type === 'income').reduce((s, x) => s + Number(x.amount), 0);
      return `<div class="tx-group-title"><span>${d}</span><span>收 ${fmt(sumI)} · 支 ${fmt(sumE)}</span></div>` + items.map(t => txRow(t, cm)).join('');
    }).join('');
    list.innerHTML = out || '<div class="empty">没有匹配的记录</div>';
    bindTxDelete(list);
  }

  async function bindTxDelete(scope) {
    $$('.tx-item', scope).forEach(el => {
      el.addEventListener('click', async () => {
        const id = el.dataset.id;
        if (!confirm('确定删除这条记录？')) return;
        const t = await Store.getTransaction(id);
        if (t && t.asset_id) {
          const a = (state.assets || []).find(x => x.id === t.asset_id);
          if (a) {
            const delta = t.type === 'income' ? -Number(t.amount) : Number(t.amount);
            await Store.saveAsset({ ...a, balance: Number(a.balance) + delta });
          }
        }
        await Store.deleteTransaction(id);
        refreshAll();
        toast('已删除');
      });
    });
  }

  // ---------- 统计页 ----------
  async function renderStats() {
    const view = $('#view-stats');
    const cm = catMap();
    const txs = await Store.getTransactions({ ledgerId: state.ledgerId, month: state.month });
    let exp = 0, inc = 0;
    const byCat = {};
    txs.forEach(t => {
      if (t.type === 'expense') {
        exp += Number(t.amount);
        byCat[t.category_id] = (byCat[t.category_id] || 0) + Number(t.amount);
      } else inc += Number(t.amount);
    });

    const segs = Object.keys(byCat).map(cid => {
      const c = cm[cid] || { name: '未分类', color: '#999', icon: '📦' };
      return { name: c.name, value: byCat[cid], color: c.color };
    }).sort((a, b) => b.value - a.value);

    const donut = segs.length
      ? buildDonut(segs, 150, 20)
      : '<div class="empty">本月暂无支出</div>';
    const legend = segs.length
      ? segs.map(s => `<div class="legend-row"><span class="legend-dot" style="background:${s.color}"></span><span class="legend-name">${esc(s.name)}</span><span class="legend-val">${fmt(s.value)} · ${(s.value / (exp || 1) * 100).toFixed(0)}%</span></div>`).join('')
      : '';

    const bars = segs.slice(0, 6).map(s => {
      const pct = (s.value / (segs[0].value || 1)) * 100;
      return `<div class="bar-row"><div class="bar-head"><span>${esc(s.name)}</span><span>${fmt(s.value)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></div>`;
    }).join('');

    // 预算
    const budgets = await Store.getBudgets({ ledgerId: state.ledgerId, month: state.month });
    const budget = budgets.find(b => !b.category_id);
    let budgetCard = '';
    if (budget) {
      const denom = Number(budget.amount) || 1;
      const pct = Math.min(100, (exp / denom) * 100);
      const over = exp > Number(budget.amount);
      budgetCard = `<div class="card">
        <div class="card-title">本月预算</div>
        <div class="bar-head"><span>已用 ${fmt(exp)} / ${fmt(budget.amount)}</span><span style="color:${over ? 'var(--expense)' : 'var(--income)'}">${pct.toFixed(0)}%</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${over ? 'var(--expense)' : 'linear-gradient(90deg,var(--primary),#6E5BEF)'}"></div></div>
        ${over ? '<div style="color:var(--expense);font-size:12px;margin-top:6px">已超出预算 ' + fmt(exp - Number(budget.amount)) + '</div>' : ''}
      </div>`;
    }

    view.innerHTML = `
      <div class="stat-summary">
        <div class="stat-box"><div class="v" style="color:var(--expense)">${fmt(exp)}</div><div class="l">支出</div></div>
        <div class="stat-box"><div class="v" style="color:var(--income)">${fmt(inc)}</div><div class="l">收入</div></div>
        <div class="stat-box"><div class="v">${fmt(inc - exp)}</div><div class="l">结余</div></div>
      </div>
      ${budgetCard}
      <div class="card">
        <div class="card-title">支出构成</div>
        <div class="donut-wrap">
          <div class="donut-center">${donut}</div>
          <div class="donut-legend">${legend}</div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">分类排行</div>
        ${bars || '<div class="empty">暂无数据</div>'}
      </div>`;
  }

  function buildDonut(segs, size, stroke) {
    const total = segs.reduce((s, x) => s + x.value, 0) || 1;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const cx = size / 2, cy = size / 2;
    let offset = 0;
    let circles = '';
    segs.forEach(s => {
      const len = (s.value / total) * c;
      circles += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${stroke}" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
      offset += len;
    });
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#eef0f6" stroke-width="${stroke}"/>
      ${circles}
      <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="13" fill="#8a90a2">总支出</text>
      <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="15" font-weight="800" fill="#1f2533">${fmt(total).slice(1)}</text>
    </svg>`;
  }

  // ---------- 我的页 ----------
  async function renderMine() {
    const view = $('#view-mine');
    const mode = Store.getMode();
    const statusPill = mode === 'supabase'
      ? '<span class="status-pill live">● 已连接 Supabase 实时同步</span>'
      : '<span class="status-pill local">● 本地存储模式（数据仅在本机）</span>';

    view.innerHTML = `
      <div class="card" style="text-align:center">${statusPill}</div>
      <div class="menu-list">
        <div class="menu-item" data-act="categories"><span class="mi-icon">🏷️</span><span class="mi-text">分类管理</span><span class="mi-arrow">›</span></div>
        <div class="menu-item" data-act="budget"><span class="mi-icon">🎯</span><span class="mi-text">月度预算</span><span class="mi-arrow">›</span></div>
      </div>
      <div class="menu-list">
        <div class="menu-item" data-act="settings"><span class="mi-icon">⚙️</span><span class="mi-text">Supabase 设置</span><span class="mi-arrow">›</span></div>
        <div class="menu-item" data-act="about"><span class="mi-icon">ℹ️</span><span class="mi-text">关于</span><span class="mi-arrow">›</span></div>
      </div>`;

    $$('#view-mine .menu-item').forEach(el => {
      el.addEventListener('click', () => {
        const act = el.dataset.act;
        if (act === 'categories') openCategoryModal();
        else if (act === 'budget') openBudgetModal();
        else if (act === 'settings') openSettingsModal();
        else if (act === 'about') openAboutModal();
      });
    });
  }

  // ---------- 记一笔弹窗 ----------
  async function openAddModal(prefillCat) {
    const cats = state.categories;
    const assets = (await Store.getAssets()) || [];
    let type = prefillCat ? prefillCat.type : 'expense';
    let selCat = prefillCat ? prefillCat.id : (cats.find(c => c.type === type) || {}).id;
    let selAsset = assets[0] ? assets[0].id : null;

    function catGrid() {
      return cats.filter(c => c.type === type).map(c => `
        <div class="cat-item${c.id === selCat ? ' selected' : ''}" data-cat="${c.id}">
          <div class="cat-icon">${c.icon}</div>
          <div class="cat-name">${esc(c.name)}</div>
        </div>`).join('');
    }

    openModal(`
      <div class="modal-header"><div class="modal-title">记一笔</div><button class="modal-close" id="m-close">×</button></div>
      <div class="type-toggle">
        <button class="type-btn expense${type === 'expense' ? ' active expense' : ''}" data-t="expense">支出</button>
        <button class="type-btn income${type === 'income' ? ' active income' : ''}" data-t="income">收入</button>
      </div>
      <div class="amount-input"><span class="cur">¥</span><input id="amt" type="text" inputmode="decimal" placeholder="0.00" autofocus /></div>
      <div class="cat-grid" id="cat-grid">${catGrid()}</div>
      <div class="field" style="display:block"><span class="f-label" style="display:block;margin-bottom:8px">账户</span>
        <div id="acct-grid" style="display:flex;gap:8px;flex-wrap:wrap">
          ${assets.map(a => `<button type="button" class="acct-btn${a.id === selAsset ? ' active' : ''}" data-a="${a.id}" style="flex:1;min-width:74px;padding:10px 6px;border:1px solid ${a.id === selAsset ? a.color : 'var(--line)'};border-radius:12px;background:${a.id === selAsset ? a.color + '1A' : '#fff'};color:${a.id === selAsset ? a.color : 'var(--text)'};font-weight:700;cursor:pointer;font-size:13px">${a.icon} ${esc(a.name)}</button>`).join('')}
        </div></div>
      <div class="field"><span class="f-label">日期</span><input id="f-date" type="date" value="${todayStr()}" /></div>
      <div class="field"><span class="f-label">备注</span><input id="f-note" type="text" placeholder="选填" /></div>
      <button class="btn-primary" id="save-tx">保存</button>
    `);

    $('#m-close').addEventListener('click', closeModal);
    $$('#modal-root .type-btn').forEach(b => b.addEventListener('click', () => {
      type = b.dataset.t;
      selCat = (cats.find(c => c.type === type) || {}).id;
      $$('#modal-root .type-btn').forEach(x => x.classList.remove('active', 'expense', 'income'));
      b.classList.add('active', type);
      $('#cat-grid').innerHTML = catGrid();
      bindCat();
    }));
    function bindCat() {
      $$('#cat-grid .cat-item').forEach(el => el.addEventListener('click', () => {
        selCat = el.dataset.cat;
        $$('#cat-grid .cat-item').forEach(x => x.classList.remove('selected'));
        el.classList.add('selected');
      }));
    }
    bindCat();
    $$('#acct-grid .acct-btn').forEach(b => b.addEventListener('click', () => {
      selAsset = b.dataset.a;
      $$('#acct-grid .acct-btn').forEach(x => {
        const on = x === b;
        const ca = assets.find(z => z.id === x.dataset.a);
        x.style.borderColor = on ? (ca ? ca.color : 'var(--primary)') : 'var(--line)';
        x.style.background = on ? ((ca ? ca.color : 'var(--primary)') + '1A') : '#fff';
        x.style.color = on ? (ca ? ca.color : 'var(--primary)') : 'var(--text)';
        x.classList.toggle('active', on);
      });
    }));

    $('#save-tx').addEventListener('click', async () => {
      const amount = parseFloat($('#amt').value);
      if (!amount || amount <= 0) { toast('请输入金额'); return; }
      if (!selCat) { toast('请选择分类'); return; }
      const occurred_at = $('#f-date').value || todayStr();
      const note = $('#f-note').value.trim();
      const assetId = selAsset;
      await Store.saveTransaction({ ledger_id: state.ledgerId, category_id: selCat, asset_id: assetId, type, amount, note, occurred_at });
      // 同步调整对应资产余额：支出减、收入加
        if (assetId) {
          const a = assets.find(x => x.id === assetId);
          if (a) {
          const delta = type === 'income' ? Number(amount) : -Number(amount);
          await Store.saveAsset({ ...a, balance: Number(a.balance) + delta });
        }
      }
      closeModal();
      await reloadCaches();
      refreshAll();
      toast('已保存');
    });
  }

  // 备用图标库（记账常用 emoji，供分类编辑/新增点选）
  const PRESET_ICONS = [
    '🍜','🍚','🍔','🍟','🍕','🍱','☕','🍺','🍰','🍎',
    '🛒','🛍️','👕','👟','💄','📱','💻','🏠','💡','🔧',
    '🧹','🚇','🚌','🚕','✈️','🎮','🎬','🎵','📺','💊',
    '🏥','📚','✏️','💰','💵','💴','📈','🎁','🧧','📦',
    '⚽','🐱','🐶','🔔','🚲','🛻','🪑','🧾','💡','🎯'
  ];

  // ---------- 分类管理 ----------
  async function openCategoryModal() {
    const cats = state.categories;
    function list(type) {
      return cats.filter(c => c.type === type).map(c => `<div class="list-row">
        <span class="lr-icon">${c.icon}</span>
        <span class="lr-main"><div class="lr-title">${esc(c.name)}</div></span>
        <button class="lr-edit" data-edit="${c.id}">编辑</button>
        <button class="lr-del" data-del="${c.id}">删除</button>
      </div>`).join('');
    }
    openModal(`
      <div class="modal-header"><div class="modal-title">分类管理</div><button class="modal-close" id="m-close">×</button></div>
      <div class="card-title">支出分类</div>
      <div id="cat-exp">${list('expense') || '<div class="empty">暂无</div>'}</div>
      <div class="card-title" style="margin-top:10px">收入分类</div>
      <div id="cat-inc">${list('income') || '<div class="empty">暂无</div>'}</div>
      <div class="card-title" style="margin-top:10px">新增分类</div>
      <div class="field"><span class="f-label">类型</span>
        <select id="nc-type"><option value="expense">支出</option><option value="income">收入</option></select></div>
      <div class="field"><span class="f-label">名称</span><input id="nc-name" placeholder="新分类名称"/></div>
      <div class="icon-pick-title">选择图标</div>
      <div class="cat-grid" id="nc-icon-grid">${PRESET_ICONS.map((ic, i) => `<div class="cat-item" data-ic="${ic}"><div class="cat-icon">${ic}</div></div>`).join('')}</div>
      <button class="btn-primary" id="add-cat">添加分类</button>
    `);
    $('#m-close').addEventListener('click', closeModal);
    let ncSel = PRESET_ICONS[0];
    $$('#nc-icon-grid .cat-item').forEach(el => el.addEventListener('click', () => {
      ncSel = el.dataset.ic;
      $$('#nc-icon-grid .cat-item').forEach(x => x.classList.toggle('selected', x === el));
    }));
    $$('#nc-icon-grid .cat-item').forEach(el => { if (el.dataset.ic === ncSel) el.classList.add('selected'); });
    $$('#modal-root [data-edit]').forEach(b => b.addEventListener('click', () => {
      const c = cats.find(x => x.id === b.dataset.edit);
      if (c) openCategoryEditModal(c);
    }));
    $$('#modal-root [data-del]').forEach(b => b.addEventListener('click', async () => {
      const c = cats.find(x => x.id === b.dataset.del);
      if (!confirm(`删除分类「${c ? c.name : ''}」？\n已有的相关记录会显示为「未分类」，不会丢失金额。建议优先用「编辑」修改。`)) return;
      await Store.deleteCategory(b.dataset.del);
      await reloadCaches(); renderRecord(); openCategoryModal();
    }));
    $('#add-cat').addEventListener('click', async () => {
      const name = $('#nc-name').value.trim();
      if (!name) { toast('请输入名称'); return; }
      const type = $('#nc-type').value;
      await Store.saveCategory({ name, type, icon: ncSel, color: type === 'expense' ? '#FF6B5E' : '#2BBF7A', builtin: false });
      await reloadCaches(); openCategoryModal();
    });
  }

  // 分类编辑（改图标 / 名称，不动 id，历史记录不受影响）
  function openCategoryEditModal(c) {
    const safeIcon = PRESET_ICONS.includes(c.icon) ? c.icon : null;
    openModal(`
      <div class="modal-header"><div class="modal-title">编辑分类</div><button class="modal-close" id="m-close">×</button></div>
      <div style="text-align:center;margin:6px 0 14px"><span style="font-size:44px" id="ec-preview">${c.icon}</span>
        <div style="font-size:12px;color:var(--text-sub);margin-top:4px">${c.type === 'expense' ? '支出分类' : '收入分类'}</div></div>
      <div class="field"><span class="f-label">名称</span><input id="ec-name" value="${esc(c.name)}" placeholder="分类名称"/></div>
      <div class="icon-pick-title">选择图标</div>
      <div class="cat-grid" id="ec-icon-grid">${PRESET_ICONS.map(ic => `<div class="cat-item" data-ic="${ic}"><div class="cat-icon">${ic}</div></div>`).join('')}</div>
      <button class="btn-primary" id="save-cat">保存修改</button>
      <button class="btn-ghost" id="back-cat">返回</button>
    `);
    $('#m-close').addEventListener('click', closeModal);
    let ecSel = safeIcon || PRESET_ICONS[0];
    $$('#ec-icon-grid .cat-item').forEach(el => {
      if (el.dataset.ic === ecSel) el.classList.add('selected');
      el.addEventListener('click', () => {
        ecSel = el.dataset.ic;
        $('#ec-preview').textContent = ecSel;
        $$('#ec-icon-grid .cat-item').forEach(x => x.classList.toggle('selected', x === el));
      });
    });
    $('#back-cat').addEventListener('click', () => openCategoryModal());
    $('#save-cat').addEventListener('click', async () => {
      const name = $('#ec-name').value.trim();
      if (!name) { toast('请输入名称'); return; }
      await Store.saveCategory({ ...c, name, icon: ecSel });
      await reloadCaches();
      refreshAll();
      openCategoryModal();
      toast('已保存');
    });
  }

  // ---------- 预算 ----------
  async function openBudgetModal() {
    const budgets = await Store.getBudgets({ ledgerId: state.ledgerId, month: state.month });
    const cur = budgets.find(b => !b.category_id);
    openModal(`
      <div class="modal-header"><div class="modal-title">${state.month} 预算</div><button class="modal-close" id="m-close">×</button></div>
      <div class="field"><span class="f-label">月度总预算</span><input id="b-amount" type="number" inputmode="decimal" placeholder="0" value="${cur ? cur.amount : ''}" style="text-align:right"/></div>
      <button class="btn-primary" id="save-budget">保存预算</button>
      ${cur ? '<button class="btn-ghost" id="del-budget">清除预算</button>' : ''}
    `);
    $('#m-close').addEventListener('click', closeModal);
    $('#save-budget').addEventListener('click', async () => {
      const amount = parseFloat($('#b-amount').value);
      if (!amount || amount <= 0) { toast('请输入金额'); return; }
      const obj = { ledger_id: state.ledgerId, category_id: null, month: state.month, amount };
      if (cur) obj.id = cur.id;
      await Store.saveBudget(obj);
      closeModal(); refreshAll(); toast('预算已保存');
    });
    const db = $('#del-budget');
    if (db) db.addEventListener('click', async () => {
      await Store.deleteBudget(cur.id);
      closeModal(); refreshAll(); toast('预算已清除');
    });
  }

  // ---------- Supabase 设置 ----------
  function openSettingsModal() {
    const cfg = Store.getConfig();
    openModal(`
      <div class="modal-header"><div class="modal-title">Supabase 设置</div><button class="modal-close" id="m-close">×</button></div>
      <p style="font-size:13px;color:var(--text-sub);margin:0 0 14px">填写后点击「连接并保存」，数据即实时同步到你的 Supabase 项目（需先执行仓库里的 sql/schema.sql）。</p>
      <div class="setting-row"><label>Project URL</label><input id="s-url" placeholder="https://xxxx.supabase.co" value="${esc(cfg.url)}"/></div>
      <div class="setting-row"><label>Anon Key（公开密钥）</label><input id="s-key" placeholder="eyJhbGci..." value="${esc(cfg.key)}"/></div>
      <button class="btn-primary" id="save-cfg">连接并保存</button>
      <button class="btn-ghost" id="clear-cfg">清除并改用本地存储</button>
    `);
    $('#m-close').addEventListener('click', closeModal);
    $('#save-cfg').addEventListener('click', async () => {
      const url = $('#s-url').value.trim();
      const key = $('#s-key').value.trim();
      if (!url || !key) { toast('请填写完整'); return; }
      const btn = $('#save-cfg'); btn.textContent = '连接中…'; btn.disabled = true;
      const mode = await Store.applyConfig(url, key);
      await reloadCaches(); refreshAll();
      closeModal();
      toast(mode === 'supabase' ? '已连接 Supabase ✓' : '连接失败，已回退本地');
    });
    $('#clear-cfg').addEventListener('click', async () => {
      await Store.applyConfig('', '');
      await reloadCaches(); refreshAll(); closeModal(); toast('已切换为本地存储');
    });
  }

  function openAboutModal() {
    const mode = Store.getMode();
    openModal(`
      <div class="modal-header"><div class="modal-title">关于</div><button class="modal-close" id="m-close">×</button></div>
      <div style="text-align:center;padding:10px 0">
        <div style="font-size:40px">🐟</div>
        <div style="font-weight:800;font-size:18px;margin-top:6px">小鱼记账</div>
        <div style="color:var(--text-sub);font-size:12px;margin-top:4px">参考有鱼记账 · 纯前端 + Supabase 实时</div>
        <div style="margin-top:10px">${mode === 'supabase' ? '<span class="status-pill live">实时同步中</span>' : '<span class="status-pill local">本地模式</span>'}</div>
      </div>`);
    $('#m-close').addEventListener('click', closeModal);
  }

  // ---------- 资产页 ----------
  async function renderAssets() {
    const view = $('#view-assets');
    const assets = await Store.getAssets();
    const total = assets.reduce((s, a) => s + Number(a.balance), 0);
    view.innerHTML = `
      <div class="card" style="background:linear-gradient(135deg,var(--primary),#6E5BEF);color:#fff">
        <div style="font-size:13px;opacity:.85">总资产</div>
        <div style="font-size:30px;font-weight:800;margin-top:4px">${fmt(total)}</div>
      </div>
      <div class="card" style="padding:6px 16px">
        ${assets.map(a => `
          <div class="list-row" data-key="${a.id}" style="cursor:pointer">
            <span class="lr-icon" style="background:${a.color}22">${a.icon}</span>
            <span class="lr-main"><div class="lr-title">${esc(a.name)}</div></span>
            <span style="font-weight:700">${fmt(a.balance)}</span>
          </div>`).join('')}
      </div>
      <div style="font-size:12px;color:var(--text-sub);text-align:center;padding:2px 14px 6px">点击任意资产可修改余额</div>`;
    $$('#view-assets .list-row').forEach(el => {
      el.addEventListener('click', () => openAssetEditModal(assets.find(a => a.id === el.dataset.key)));
    });
  }

  function openAssetEditModal(a) {
    openModal(`
      <div class="modal-header"><div class="modal-title">${esc(a.name)} 余额</div><button class="modal-close" id="m-close">×</button></div>
      <div class="amount-input"><span class="cur">¥</span><input id="a-amt" type="text" inputmode="decimal" value="${a.balance}" /></div>
      <button class="btn-primary" id="save-asset">保存余额</button>
    `);
    $('#m-close').addEventListener('click', closeModal);
    $('#save-asset').addEventListener('click', async () => {
      const v = parseFloat($('#a-amt').value);
      if (isNaN(v)) { toast('请输入金额'); return; }
      await Store.saveAsset({ id: a.id, akey: a.akey, name: a.name, icon: a.icon, color: a.color, balance: v });
      closeModal(); refreshAll(); toast('已保存');
    });
  }

  // ---------- 视图切换 ----------
  function switchView(v) {
    state.view = v;
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    $$('.view').forEach(s => s.classList.remove('active'));
    $('#view-' + v).classList.add('active');
    renderCurrent();
  }
  async function renderCurrent() {
    if (state.view === 'record') await renderRecord();
    else if (state.view === 'detail') await renderDetail();
    else if (state.view === 'assets') await renderAssets();
    else if (state.view === 'stats') await renderStats();
    else if (state.view === 'mine') await renderMine();
  }
  async function refreshAll() {
    await renderHeader();
    await renderCurrent();
  }

  // ---------- 实时订阅 ----------
  function setupRealtime() {
    state.unsubs.forEach(u => u && u());
    state.unsubs = [];
    const onTx = () => { refreshAll(); toast('数据已更新（实时）'); };
    state.unsubs.push(Store.subscribe('transactions', onTx));
    state.unsubs.push(Store.subscribe('assets', () => { reloadCaches().then(refreshAll); }));
    state.unsubs.push(Store.subscribe('categories', () => { reloadCaches().then(refreshAll); }));
  }

  // ---------- 事件绑定 ----------
  function bindGlobal() {
    $$('.nav-item').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
    $('#fab-add').addEventListener('click', () => openAddModal(null));
    $('#btn-settings').addEventListener('click', () => openSettingsModal());
    $('#month-prev').addEventListener('click', () => changeMonth(-1));
    $('#month-next').addEventListener('click', () => changeMonth(1));
  }
  function changeMonth(delta) {
    const [y, m] = state.month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    state.month = monthKeyOf(d);
    localStorage.setItem('yy_current_month', state.month);
    refreshAll();
  }

  // ---------- 启动 ----------
  async function boot() {
    bindGlobal();
    await Store.init();
    await reloadCaches();
    await renderHeader();
    await renderCurrent();
    if (Store.isLive()) setupRealtime();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
