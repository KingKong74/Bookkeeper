-- ============================================================
-- Migration 007: Merchant Hints + Org Settings + Pending Suggestions
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Org-level settings (feature flags, preferences)
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Helper to get a setting with a default
-- e.g. SELECT org_get_setting(org_id, 'merchantIntelEnabled', 'true')
-- (not strictly needed but useful for future use)

-- 2. Merchant hints table
--    Global hints (org_id IS NULL) are the built-in defaults.
--    Per-org hints (org_id IS NOT NULL) override or extend the defaults.
CREATE TABLE IF NOT EXISTS merchant_hints (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID REFERENCES organisations(id) ON DELETE CASCADE,
  keyword     TEXT NOT NULL,         -- lowercase merchant keyword e.g. 'woolworths'
  hint        TEXT NOT NULL,         -- category label hint e.g. 'groceries'
  cat_type    TEXT NOT NULL DEFAULT 'expense'
              CHECK (cat_type IN ('income','expense','asset','liability','equity')),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, keyword)           -- one hint per keyword per org (nulls allowed for global)
);

-- Global hints visible to all orgs; org-specific hints override
CREATE INDEX IF NOT EXISTS merchant_hints_org ON merchant_hints(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS merchant_hints_keyword ON merchant_hints(keyword);

-- RLS: orgs can read global hints + their own hints; can write their own hints
ALTER TABLE merchant_hints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS merchant_hints_read  ON merchant_hints;
DROP POLICY IF EXISTS merchant_hints_write ON merchant_hints;

CREATE POLICY merchant_hints_read ON merchant_hints
  FOR SELECT USING (
    org_id IS NULL   -- global hints readable by everyone
    OR org_id IN (
      SELECT org_id FROM memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY merchant_hints_write ON merchant_hints
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM memberships WHERE user_id = auth.uid()
    )
  );

-- 3. Seed global merchant hints (the 100+ from helpers.js, moved here)
INSERT INTO merchant_hints (org_id, keyword, hint, cat_type) VALUES
-- Groceries
(NULL,'woolworths','groceries','expense'),
(NULL,'coles','groceries','expense'),
(NULL,'aldi','groceries','expense'),
(NULL,'iga','groceries','expense'),
(NULL,'foodworks','groceries','expense'),
(NULL,'costco','groceries','expense'),
-- Dining
(NULL,'dominos','dining','expense'),
(NULL,'domino''s','dining','expense'),
(NULL,'mcdonalds','dining','expense'),
(NULL,'mcdonald''s','dining','expense'),
(NULL,'kfc','dining','expense'),
(NULL,'subway','dining','expense'),
(NULL,'uber eats','dining','expense'),
(NULL,'ubereats','dining','expense'),
(NULL,'doordash','dining','expense'),
(NULL,'menulog','dining','expense'),
(NULL,'hungry jacks','dining','expense'),
(NULL,'pizza','dining','expense'),
(NULL,'cafe','dining','expense'),
(NULL,'coffee','dining','expense'),
-- Subscriptions
(NULL,'netflix','subscriptions','expense'),
(NULL,'spotify','subscriptions','expense'),
(NULL,'apple','subscriptions','expense'),
(NULL,'google','subscriptions','expense'),
(NULL,'adobe','subscriptions','expense'),
(NULL,'microsoft','subscriptions','expense'),
(NULL,'amazon','subscriptions','expense'),
(NULL,'stan','subscriptions','expense'),
(NULL,'disney','subscriptions','expense'),
(NULL,'binge','subscriptions','expense'),
(NULL,'foxtel','subscriptions','expense'),
(NULL,'youtube','subscriptions','expense'),
(NULL,'canva','subscriptions','expense'),
(NULL,'dropbox','subscriptions','expense'),
(NULL,'chatgpt','subscriptions','expense'),
(NULL,'openai','subscriptions','expense'),
(NULL,'github','subscriptions','expense'),
(NULL,'claude','subscriptions','expense'),
-- Transport
(NULL,'uber','transport','expense'),
(NULL,'ola','transport','expense'),
(NULL,'didi','transport','expense'),
(NULL,'opal','transport','expense'),
(NULL,'myki','transport','expense'),
(NULL,'parking','transport','expense'),
-- Fuel
(NULL,'bp','fuel','expense'),
(NULL,'shell','fuel','expense'),
(NULL,'caltex','fuel','expense'),
(NULL,'ampol','fuel','expense'),
(NULL,'7-eleven','fuel','expense'),
(NULL,'7eleven','fuel','expense'),
(NULL,'puma','fuel','expense'),
-- Utilities & phone
(NULL,'telstra','utilities','expense'),
(NULL,'optus','utilities','expense'),
(NULL,'vodafone','utilities','expense'),
(NULL,'tpg','utilities','expense'),
(NULL,'origin','utilities','expense'),
(NULL,'agl','utilities','expense'),
(NULL,'energy','utilities','expense'),
(NULL,'alinta','utilities','expense'),
-- Health & fitness
(NULL,'goodlife','gym','expense'),
(NULL,'anytime fitness','gym','expense'),
(NULL,'gym','gym','expense'),
(NULL,'f45','gym','expense'),
(NULL,'crossfit','gym','expense'),
(NULL,'chemist','health','expense'),
(NULL,'pharmacy','health','expense'),
(NULL,'priceline','health','expense'),
(NULL,'nib','health','expense'),
(NULL,'medibank','health','expense'),
(NULL,'bupa','health','expense'),
-- Shopping
(NULL,'kmart','shopping','expense'),
(NULL,'target','shopping','expense'),
(NULL,'big w','shopping','expense'),
(NULL,'myer','shopping','expense'),
(NULL,'david jones','shopping','expense'),
(NULL,'ikea','shopping','expense'),
(NULL,'jb hi-fi','shopping','expense'),
(NULL,'bunnings','shopping','expense'),
(NULL,'officeworks','shopping','expense'),
-- Investments
(NULL,'betashares','investments','asset'),
(NULL,'vanguard','investments','asset'),
(NULL,'comsec','investments','asset'),
(NULL,'selfwealth','investments','asset'),
(NULL,'coinspot','investments','asset'),
(NULL,'raiz','investments','asset'),
(NULL,'spaceship','investments','asset'),
-- Income
(NULL,'payroll','salary','income'),
(NULL,'salary','salary','income'),
(NULL,'centrelink','government','income'),
(NULL,'ato','tax','income')
ON CONFLICT (org_id, keyword) DO NOTHING;

-- 4. Pending category suggestions
--    Persists merchant-intelligence suggestions so they survive page refreshes.
--    Cleared when user approves or dismisses.
CREATE TABLE IF NOT EXISTS pending_suggestions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  suggested_cat_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  suggested_payee TEXT,
  confidence      TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high','medium','low')),
  reason          TEXT,           -- e.g. 'Merchant: Woolworths'
  source          TEXT NOT NULL DEFAULT 'merchant_intel'
                  CHECK (source IN ('merchant_intel','rule','manual')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, transaction_id)  -- one pending suggestion per transaction
);

ALTER TABLE pending_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY pending_suggestions_policy ON pending_suggestions
  FOR ALL USING (
    org_id IN (SELECT org_id FROM memberships WHERE user_id = auth.uid())
  );
