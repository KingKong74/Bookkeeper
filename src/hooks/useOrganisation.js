/**
 * hooks/useOrganisation.js
 * ------------------------
 * Organisation-level data and settings operations.
 * Provides a clean API for updating org settings, budgets, and tax profiles.
 */

import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';

export function useOrganisation() {
  const { org, orgSettings, setOrgSettings } = useApp();

  async function updateSetting(key, value) {
    if (!org) return;
    const { error } = await supabase
      .from('org_settings')
      .upsert({ org_id: org.id, key, value: String(value) }, { onConflict: 'org_id,key' });
    if (error) throw error;
    // Reflect in local state immediately
    setOrgSettings(prev => ({ ...prev, [key]: value }));
  }

  return { org, orgSettings, updateSetting };
}
