// 数据层：根据配置自动在「本地存储」与「Supabase」之间切换
const Store = (() => {
  let sb = null;
  let mode = 'local';
  let cfg = { url: '', key: '' };

  const LS = {
    ledgers: 'yy_ledgers',
    categories: 'yy_categories',
    transactions: 'yy_transactions',
    budgets: 'yy_budgets',
    assets: 'yy_assets',
    config: 'yy_supabase_config',
    curLedger: 'yy_current_ledger',
    curMonth: 'yy_current_month'
  };

  function loadConfig() {
    let c = null;
    try { c = JSON.parse(localStorage.getItem(LS.config)); } catch (e) { }
    if (!c || !c.url || !c.key) {
      c = {
        url: (window.APP_CONFIG && window.APP_CONFIG.SUPABASE_URL) || '',
        key: (window.APP_CONFIG && window.APP_CONFIG.SUPABASE_ANON_KEY) || ''
      };
    }
    cfg = c;
  }

  async function init() {
    loadConfig();
    if (cfg.url && cfg.key && typeof window.supabase !== 'undefined') {
      try {
        sb = window.supabase.createClient(cfg.url, cfg.key);
        const { error } = await sb.from('ledgers').select('id', { count: 'exact', head: true });
        mode = error ? 'local' : 'supabase';
        if (error) sb = null;
      } catch (e) { mode = 'local'; sb = null; }
    } else {
      mode = 'local';
    }
    await ensureSeed();
    return mode;
  }

  function isLive() { return mode === 'supabase'; }
  function getMode() { return mode; }
  function getConfig() { return cfg; }

  // 设置页调用：保存配置并重新初始化
  async function applyConfig(url, key) {
    cfg = { url: url || '', key: key || '' };
    if (cfg.url && cfg.key) localStorage.setItem(LS.config, JSON.stringify(cfg));
    else localStorage.removeItem(LS.config);
    mode = 'local'; sb = null;
    return await init();
  }

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  // ---------- 本地读写 ----------
  function readArr(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; } }
  function writeArr(key, arr) { localStorage.setItem(key, JSON.stringify(arr)); }
  function todayStr() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }
  function monthFirstLast(month) {
    const [y, m] = month.split('-').map(Number);
    const first = `${month}-01`;
    const last = new Date(y, m, 0); // 当月最后一天
    const ld = String(last.getDate()).padStart(2, '0');
    return { first, last: `${y}-${String(m).padStart(2, '0')}-${ld}` };
  }

  // ---------- 种子数据 ----------
  async function ensureSeed() {
    const seed = (window.SEED) || { ledgers: [], categories: [], assets: [] };
    if (mode === 'local') {
      if (readArr(LS.categories).length === 0) writeArr(LS.categories, seed.categories.map(c => ({ ...c, id: uid() })));
      if (readArr(LS.ledgers).length === 0) writeArr(LS.ledgers, seed.ledgers.map(l => ({ ...l, id: uid() })));
      if (readArr(LS.assets).length === 0) writeArr(LS.assets, seed.assets.map(a => ({ ...a, id: uid() })));
    } else {
      const { count } = await sb.from('categories').select('id', { count: 'exact', head: true });
      if (!count) await sb.from('categories').insert(seed.categories.map(c => ({ ...c })));
      const { count: lc } = await sb.from('ledgers').select('id', { count: 'exact', head: true });
      if (!lc) await sb.from('ledgers').insert(seed.ledgers.map(l => ({ ...l })));
      const { count: ac } = await sb.from('assets').select('id', { count: 'exact', head: true });
      if (!ac) await sb.from('assets').insert(seed.assets.map(a => ({ ...a })));
    }
  }

  // ---------- 账本 ----------
  async function getLedgers() {
    if (mode === 'local') return readArr(LS.ledgers);
    const { data } = await sb.from('ledgers').select('*').order('created_at');
    return data || [];
  }
  async function saveLedger(obj) {
    const o = { ...obj };
    if (!o.id) o.id = uid();
    if (mode === 'local') {
      const arr = readArr(LS.ledgers);
      const i = arr.findIndex(x => x.id === o.id);
      if (i >= 0) arr[i] = o; else arr.push(o);
      writeArr(LS.ledgers, arr);
      return o;
    }
    const { data, error } = await sb.from('ledgers').upsert(o).select().single();
    if (error) throw error;
    return data || o;
  }
  async function deleteLedger(id) {
    if (mode === 'local') {
      writeArr(LS.ledgers, readArr(LS.ledgers).filter(x => x.id !== id));
      return;
    }
    await sb.from('ledgers').delete().eq('id', id);
  }

  // ---------- 分类 ----------
  async function getCategories() {
    if (mode === 'local') return readArr(LS.categories);
    const { data } = await sb.from('categories').select('*').order('type').order('name');
    return data || [];
  }
  async function saveCategory(obj) {
    const o = { ...obj };
    if (!o.id) o.id = uid();
    if (mode === 'local') {
      const arr = readArr(LS.categories);
      const i = arr.findIndex(x => x.id === o.id);
      if (i >= 0) arr[i] = o; else arr.push(o);
      writeArr(LS.categories, arr);
      return o;
    }
    const { data, error } = await sb.from('categories').upsert(o).select().single();
    if (error) throw error;
    return data || o;
  }
  async function deleteCategory(id) {
    if (mode === 'local') {
      writeArr(LS.categories, readArr(LS.categories).filter(x => x.id !== id));
      return;
    }
    await sb.from('categories').delete().eq('id', id);
  }

  // ---------- 交易 ----------
  async function getTransactions({ ledgerId, month } = {}) {
    if (mode === 'local') {
      let arr = readArr(LS.transactions);
      if (ledgerId) arr = arr.filter(t => t.ledger_id === ledgerId);
      if (month) arr = arr.filter(t => (t.occurred_at || '').startsWith(month));
      arr.sort((a, b) => (b.occurred_at + b.created_at).localeCompare(a.occurred_at + a.created_at));
      return arr;
    }
    let q = sb.from('transactions').select('*');
    if (ledgerId) q = q.eq('ledger_id', ledgerId);
    if (month) { const { first, last } = monthFirstLast(month); q = q.gte('occurred_at', first).lte('occurred_at', last); }
    q = q.order('occurred_at', { ascending: false }).order('created_at', { ascending: false });
    const { data } = await q;
    return data || [];
  }
  async function saveTransaction(obj) {
    const o = { ...obj };
    if (!o.id) o.id = uid();
    if (!o.created_at) o.created_at = new Date().toISOString();
    if (mode === 'local') {
      const arr = readArr(LS.transactions);
      const i = arr.findIndex(x => x.id === o.id);
      if (i >= 0) arr[i] = o; else arr.push(o);
      writeArr(LS.transactions, arr);
      return o;
    }
    const { data, error } = await sb.from('transactions').upsert(o).select().single();
    if (error) throw error;
    return data || o;
  }
  async function deleteTransaction(id) {
    if (mode === 'local') {
      writeArr(LS.transactions, readArr(LS.transactions).filter(x => x.id !== id));
      return;
    }
    await sb.from('transactions').delete().eq('id', id);
  }
  async function getTransaction(id) {
    if (mode === 'local') return readArr(LS.transactions).find(x => x.id === id) || null;
    const { data } = await sb.from('transactions').select('*').eq('id', id).single();
    return data || null;
  }

  // ---------- 预算 ----------
  async function getBudgets({ ledgerId, month } = {}) {
    if (mode === 'local') {
      let arr = readArr(LS.budgets);
      if (ledgerId) arr = arr.filter(b => b.ledger_id === ledgerId);
      if (month) arr = arr.filter(b => b.month === month);
      return arr;
    }
    let q = sb.from('budgets').select('*');
    if (ledgerId) q = q.eq('ledger_id', ledgerId);
    if (month) q = q.eq('month', month);
    const { data } = await q;
    return data || [];
  }
  async function saveBudget(obj) {
    const o = { ...obj };
    if (!o.id) o.id = uid();
    if (mode === 'local') {
      const arr = readArr(LS.budgets);
      const i = arr.findIndex(x => x.id === o.id);
      if (i >= 0) arr[i] = o; else arr.push(o);
      writeArr(LS.budgets, arr);
      return o;
    }
    const { data, error } = await sb.from('budgets').upsert(o).select().single();
    if (error) throw error;
    return data || o;
  }
  async function deleteBudget(id) {
    if (mode === 'local') {
      writeArr(LS.budgets, readArr(LS.budgets).filter(x => x.id !== id));
      return;
    }
    await sb.from('budgets').delete().eq('id', id);
  }

  // ---------- 资产 ----------
  async function getAssets() {
    if (mode === 'local') return readArr(LS.assets);
    const { data } = await sb.from('assets').select('*').order('created_at');
    return data || [];
  }
  async function saveAsset(obj) {
    const o = { ...obj };
    if (!o.id) o.id = uid();
    if (mode === 'local') {
      const arr = readArr(LS.assets);
      const i = arr.findIndex(x => x.id === o.id);
      if (i >= 0) arr[i] = o; else arr.push(o);
      writeArr(LS.assets, arr);
      return o;
    }
    const { data, error } = await sb.from('assets').upsert(o).select().single();
    if (error) throw error;
    return data || o;
  }

  // ---------- 实时订阅 ----------
  // 返回取消订阅的函数
  function subscribe(table, onChange) {
    if (mode !== 'supabase' || !sb) return () => { };
    const channel = sb.channel(`yy-${table}-${Math.random().toString(16).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
      .subscribe();
    return () => sb.removeChannel(channel);
  }

  return {
    init, isLive, getMode, getConfig, applyConfig, getLedgers, saveLedger, deleteLedger,
    getCategories, saveCategory, deleteCategory,
    getTransactions, saveTransaction, deleteTransaction, getTransaction,
    getBudgets, saveBudget, deleteBudget,
    getAssets, saveAsset, subscribe, todayStr
  };
})();
