/**
 * views/Tax/TaxTracker.jsx
 * -------------------------
 * Australian individual income tax liability estimator.
 *
 * Shows:
 *   - Running income YTD from transactions
 *   - Projected full-year income (extrapolated from YTD)
 *   - Estimated tax liability breakdown
 *   - Key inputs (salary sacrifice, private health, HELP, deductions)
 *   - A progress bar showing how far through the FY we are
 *
 * The user can edit their tax profile inputs here and save them.
 * Calculations update live as inputs change.
 */

import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { MetricCard } from '../../components/ui/index';
import { upsertTaxProfile } from '../../lib/supabase';
import { calculateTax, deriveIncomeFromTransactions, fmtTaxAmount } from '../../utils/taxEngine';
import { fmt, currentFYStart, fyLabel, filterByDateRange } from '../../utils/helpers';

export function TaxTracker() {
  const {
    transactions, catMap, org,
    taxProfile, setTaxProfile,
    taxRefData,
    dateFrom, dateTo, fyMode,
    toast,
  } = useApp();

  const fyStart = typeof fyMode === 'number' ? fyMode : currentFYStart();

  // ── Local form state (mirrors taxProfile from DB) ──────────────────────
  const [form, setForm] = useState({
    residency_status:       'resident',
    salary_sacrifice_super: 0,
    personal_super_contrib: 0,
    other_deductions:       0,
    has_private_health:     false,
    private_health_tier:    null,
    has_help_debt:          false,
    help_balance:           0,
  });
  const [saving, setSaving] = useState(false);

  // Sync form with DB profile when it loads
  useEffect(() => {
    if (taxProfile) setForm({ ...form, ...taxProfile });
  }, [taxProfile]); // eslint-disable-line

  // ── Income calculation ────────────────────────────────────────────────
  // Get all transactions for the full FY (not just the active date range)
  const fyFrom = `${fyStart}-07-01`;
  const fyTo   = `${fyStart + 1}-06-30`;
  const fyTxns = filterByDateRange(transactions, fyFrom, fyTo);

  const ytdIncome = deriveIncomeFromTransactions(fyTxns, catMap);

  // Extrapolate to full year based on how far through the FY we are
  const today     = new Date();
  const fyEnd     = new Date(`${fyStart + 1}-06-30`);
  const fyBegin   = new Date(`${fyStart}-07-01`);
  const fyProgress = Math.min(1, Math.max(0,
    (today - fyBegin) / (fyEnd - fyBegin)
  ));
  const projectedIncome = fyProgress > 0.05
    ? Math.round(ytdIncome / fyProgress)
    : ytdIncome;

  const fyProgressPct = Math.round(fyProgress * 100);

  // ── Tax calculations (live, as form changes) ──────────────────────────
  const ytdTax  = calculateTax({ grossIncome: ytdIncome,       profile: form, refData: taxRefData });
  const projTax = calculateTax({ grossIncome: projectedIncome, profile: form, refData: taxRefData });

  // ── Save profile ──────────────────────────────────────────────────────
  async function handleSave() {
    if (!org) return;
    setSaving(true);
    try {
      const updated = await upsertTaxProfile(org.id, fyStart, form);
      setTaxProfile(updated);
      toast('Tax profile saved.');
    } catch (e) {
      toast('Failed to save: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  const field = (key, val) => setForm(f => ({ ...f, [key]: val }));

  return (
    <div>
      {/* FY header */}
      <div style={{ marginBottom: 14, padding: '10px 14px', background: 'var(--bg-card)', border: '0.5px solid var(--bd)', borderRadius: 'var(--rl)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
            {fyLabel(fyStart)} · {fyProgressPct}% complete
          </div>
          <div style={{ height: 6, background: 'var(--sand3)', borderRadius: 3 }}>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--a)', width: `${fyProgressPct}%`, transition: 'width 0.4s' }} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--stone)', whiteSpace: 'nowrap' }}>
          {today.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      </div>

      {/* KPI row — YTD */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--stone)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Year to date</div>
        <div className="metrics">
          <MetricCard label="Income YTD"       value={fmt(ytdIncome)}             valueClass="vp" />
          <MetricCard label="Taxable income"   value={fmt(ytdTax.taxableIncome)}  valueClass="vp" />
          <MetricCard label="Est. tax YTD"     value={fmt(ytdTax.totalLiability)} valueClass="vn" />
          <MetricCard label="Effective rate"   value={`${ytdTax.effectiveRate}%`} valueClass="va" sub={`Marginal: ${ytdTax.marginalRate}%`} />
        </div>
      </div>

      {/* KPI row — projected */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--stone)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Projected full year</div>
        <div className="metrics">
          <MetricCard label="Projected income"   value={fmt(projectedIncome)}        valueClass="vp" sub="Extrapolated from YTD" />
          <MetricCard label="Projected tax"      value={fmt(projTax.totalLiability)} valueClass="vn" />
          <MetricCard label="Tax deductions"     value={fmt(projTax.totalDeductions)} valueClass="vp" sub="Reduces taxable income" />
          <MetricCard label="After-tax income"   value={fmt(projectedIncome - projTax.totalLiability)} valueClass={projectedIncome - projTax.totalLiability >= 0 ? 'vp' : 'vn'} />
        </div>
      </div>

      <div className="two-col">
        {/* ── Tax breakdown ── */}
        <div className="card">
          <div className="ch"><h3>Estimated tax breakdown</h3><p>Projected full year</p></div>
          <div style={{ padding: '4px 0' }}>
            <TaxLine label="Gross income"         value={fmt(projectedIncome)} />
            <TaxLine label="Total deductions"     value={`− ${fmt(projTax.totalDeductions)}`} muted />
            <TaxLine label="Taxable income"       value={fmt(projTax.taxableIncome)} bold />
            <div style={{ height: 1, background: 'var(--bd)', margin: '4px 0' }} />
            <TaxLine label="Income tax"           value={fmt(projTax.incomeTax)} />
            <TaxLine label="Low income tax offset" value={projTax.lito > 0 ? `− ${fmt(projTax.lito)}` : '—'} muted={projTax.lito === 0} green={projTax.lito > 0} />
            <TaxLine label="Medicare levy (2%)"   value={fmt(projTax.medicare)} />
            {projTax.medicareLevySurcharge > 0 && (
              <TaxLine label="Medicare levy surcharge" value={fmt(projTax.medicareLevySurcharge)} warn />
            )}
            {projTax.helpRepayment > 0 && (
              <TaxLine label="HELP repayment"     value={fmt(projTax.helpRepayment)} />
            )}
            <div style={{ height: 1, background: 'var(--bd2)', margin: '4px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--ab)', fontWeight: 500, fontSize: 13, borderTop: '0.5px solid var(--a)' }}>
              <span>Total estimated liability</span>
              <span style={{ color: 'var(--rd)' }}>{fmt(projTax.totalLiability)}</span>
            </div>
          </div>
        </div>

        {/* ── Tax profile inputs ── */}
        <div className="card">
          <div className="ch">
            <h3>Tax profile</h3>
            <p>{fyLabel(fyStart)}</p>
            <div className="ch-r">
              <button className="btn btn-a btn-sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          <div style={{ padding: 14 }}>
            <div className="field">
              <label>Residency status</label>
              <select value={form.residency_status} onChange={e => field('residency_status', e.target.value)}>
                <option value="resident">Australian resident</option>
                <option value="non_resident">Non-resident</option>
                <option value="working_holiday">Working holiday maker</option>
              </select>
            </div>

            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--stone)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, marginTop: 4 }}>Deductions</div>

            <div className="field">
              <label>Salary sacrifice (super) — pre-tax</label>
              <input type="number" min="0" step="100"
                value={form.salary_sacrifice_super}
                onChange={e => field('salary_sacrifice_super', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="field">
              <label>Personal super contributions — after-tax (deductible)</label>
              <input type="number" min="0" step="100"
                value={form.personal_super_contrib}
                onChange={e => field('personal_super_contrib', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="field">
              <label>Other deductions (work-related, donations, etc.)</label>
              <input type="number" min="0" step="100"
                value={form.other_deductions}
                onChange={e => field('other_deductions', parseFloat(e.target.value) || 0)} />
            </div>

            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--stone)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, marginTop: 4 }}>Medicare</div>

            <div className="field" style={{ marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.has_private_health}
                  onChange={e => field('has_private_health', e.target.checked)}
                  style={{ width: 'auto' }} />
                I have private hospital cover
              </label>
              <p style={{ fontSize: 11, color: 'var(--stone)', marginTop: 3 }}>
                Without this, you may pay the Medicare levy surcharge (1%) if income &gt; $93,000.
              </p>
            </div>

            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--stone)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, marginTop: 4 }}>HELP / HECS</div>

            <div className="field" style={{ marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.has_help_debt}
                  onChange={e => field('has_help_debt', e.target.checked)}
                  style={{ width: 'auto' }} />
                I have a HELP / HECS debt
              </label>
            </div>

            {form.has_help_debt && (
              <div className="field">
                <label>Estimated HELP balance</label>
                <input type="number" min="0" step="1000"
                  value={form.help_balance}
                  onChange={e => field('help_balance', parseFloat(e.target.value) || 0)} />
              </div>
            )}

            {projTax.helpRepayment > 0 && (
              <div style={{ padding: '8px 10px', background: 'var(--al)', borderRadius: 'var(--rr)', fontSize: 12, color: 'var(--a2)' }}>
                Estimated HELP repayment this FY: <strong>{fmt(projTax.helpRepayment)}</strong>
              </div>
            )}

            {!taxRefData && (
              <div style={{ padding: '8px 10px', background: 'var(--rdb)', borderRadius: 'var(--rr)', fontSize: 12, color: 'var(--rd)', marginTop: 8 }}>
                Tax reference data not loaded. Check your Supabase connection.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helper: a single row in the tax breakdown ────────────────────────────────
function TaxLine({ label, value, muted, bold, green, warn }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 14px', fontSize: 12.5 }}>
      <span style={{ color: muted ? 'var(--stone)' : 'var(--ink)' }}>{label}</span>
      <span style={{
        fontVariantNumeric: 'tabular-nums',
        fontWeight: bold ? 500 : 400,
        color: green ? 'var(--gn)' : warn ? 'var(--rd)' : 'var(--ink)',
      }}>
        {value}
      </span>
    </div>
  );
}
