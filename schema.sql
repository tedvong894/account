-- ============================================================
-- 小鱼记账 · Supabase 表结构 / 权限 / 实时发布
-- 在 Supabase 控制台的 SQL Editor 中完整粘贴执行一次即可
-- ============================================================

-- 启用 uuid 生成扩展
create extension if not exists "pgcrypto";

-- 账本
create table if not exists public.ledgers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  icon        text default '📒',
  color       text default '#4C8DFF',
  created_at  timestamptz default now()
);

-- 分类
create table if not exists public.categories (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  type      text not null check (type in ('expense','income')),
  icon      text default '📦',
  color     text default '#999999',
  builtin   boolean default false
);

-- 交易记录
create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  ledger_id   uuid references public.ledgers(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  asset_id    uuid references public.assets(id) on delete set null,
  type        text not null check (type in ('expense','income')),
  amount      numeric not null check (amount >= 0),
  note        text default '',
  occurred_at date not null default current_date,
  created_at  timestamptz default now()
);

-- 预算（ledger + month + 分类 唯一；category_id 为 null 表示账本总预算）
create table if not exists public.budgets (
  id          uuid primary key default gen_random_uuid(),
  ledger_id   uuid references public.ledgers(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  month       text not null,
  amount      numeric not null check (amount >= 0),
  unique (ledger_id, category_id, month)
);

create index if not exists idx_tx_ledger on public.transactions(ledger_id);
create index if not exists idx_tx_date   on public.transactions(occurred_at);
create index if not exists idx_tx_asset  on public.transactions(asset_id);

-- 资产账户（银行存款 / 现金 / 支付宝 / 微信）
create table if not exists public.assets (
  id        uuid primary key default gen_random_uuid(),
  akey      text unique not null,
  name      text not null,
  icon      text default '💰',
  color     text default '#4C8DFF',
  balance   numeric not null default 0,
  created_at timestamptz default now()
);

-- ============================================================
-- 行级安全（RLS）
-- 说明：本应用为个人记账，默认对「匿名(anon)」开放全部读写。
-- 若你的项目有多人协作需求，请改为基于 auth.uid() 的细粒度策略。
-- ============================================================
alter table public.ledgers     enable row level security;
alter table public.categories  enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets     enable row level security;

drop policy if exists "public all ledgers"     on public.ledgers;
drop policy if exists "public all categories"  on public.categories;
drop policy if exists "public all transactions" on public.transactions;
drop policy if exists "public all budgets"     on public.budgets;

create policy "public all ledgers"     on public.ledgers     for all using (true) with check (true);
create policy "public all categories"  on public.categories  for all using (true) with check (true);
create policy "public all transactions" on public.transactions for all using (true) with check (true);
create policy "public all budgets"     on public.budgets     for all using (true) with check (true);

alter table public.assets      enable row level security;
drop policy if exists "public all assets" on public.assets;
create policy "public all assets" on public.assets for all using (true) with check (true);

-- ============================================================
-- 实时（Realtime）发布：让前端能收到增删改的即时推送
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='ledgers')     then alter publication supabase_realtime add table public.ledgers;     end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='categories')  then alter publication supabase_realtime add table public.categories;  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='transactions') then alter publication supabase_realtime add table public.transactions; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='budgets')     then alter publication supabase_realtime add table public.budgets;     end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='assets')      then alter publication supabase_realtime add table public.assets;      end if;
end $$;
