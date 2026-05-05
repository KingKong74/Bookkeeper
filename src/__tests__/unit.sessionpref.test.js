/**
 * unit.sessionpref.test.js
 * Unit tests for useSessionPref.js — localStorage TTL preference store.
 * Coverage: get/set/clear, TTL expiry, error handling, data integrity.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getSessionPref, setSessionPref, clearSessionPref } from '../hooks/useSessionPref.js';

// Mock localStorage for test environment
const store = {};
vi.stubGlobal('localStorage', {
  getItem:    k => store[k] ?? null,
  setItem:    (k,v) => { store[k]=v; },
  removeItem: k => { delete store[k]; },
  clear:      () => { Object.keys(store).forEach(k=>delete store[k]); },
});

beforeEach(() => { Object.keys(store).forEach(k=>delete store[k]); });

describe('setSessionPref() + getSessionPref()', () => {
  it('stores and retrieves a string value',        () => { setSessionPref('test','hello'); expect(getSessionPref('test')).toBe('hello'); });
  it('stores and retrieves a number',              () => { setSessionPref('n',42); expect(getSessionPref('n')).toBe(42); });
  it('stores and retrieves a boolean',             () => { setSessionPref('flag',true); expect(getSessionPref('flag')).toBe(true); });
  it('stores and retrieves an object',             () => { setSessionPref('obj',{a:1}); expect(getSessionPref('obj')).toEqual({a:1}); });
  it('stores and retrieves an array',              () => { setSessionPref('arr',[1,2,3]); expect(getSessionPref('arr')).toEqual([1,2,3]); });
  it('returns null for unknown key',               () => expect(getSessionPref('nonexistent')).toBeNull());
  it('different keys do not collide',              () => {
    setSessionPref('a','va'); setSessionPref('b','vb');
    expect(getSessionPref('a')).toBe('va');
    expect(getSessionPref('b')).toBe('vb');
  });
  it('overwrites previous value on same key',      () => {
    setSessionPref('x','old'); setSessionPref('x','new');
    expect(getSessionPref('x')).toBe('new');
  });
});

describe('clearSessionPref()', () => {
  it('removes the key so getSessionPref returns null', () => {
    setSessionPref('key','val'); clearSessionPref('key');
    expect(getSessionPref('key')).toBeNull();
  });
  it('clearing nonexistent key does not throw',    () => expect(()=>clearSessionPref('nonexistent')).not.toThrow());
  it('clears only the specified key',              () => {
    setSessionPref('a','1'); setSessionPref('b','2'); clearSessionPref('a');
    expect(getSessionPref('b')).toBe('2');
  });
});

describe('TTL expiry', () => {
  it('expired value returns null', () => {
    // Set with 1ms TTL
    setSessionPref('exp','gone',1);
    // Manually expire it by manipulating store
    const raw=JSON.parse(store['pref_exp']);
    store['pref_exp']=JSON.stringify({...raw,expires:Date.now()-1000});
    expect(getSessionPref('exp')).toBeNull();
  });
  it('expired value removes itself from storage', () => {
    setSessionPref('exp2','gone',1);
    const raw=JSON.parse(store['pref_exp2']);
    store['pref_exp2']=JSON.stringify({...raw,expires:Date.now()-1000});
    getSessionPref('exp2'); // trigger cleanup
    expect(store['pref_exp2']).toBeUndefined();
  });
  it('non-expired value is returned',             () => {
    setSessionPref('valid','here', 60000);
    expect(getSessionPref('valid')).toBe('here');
  });
});

describe('Error handling', () => {
  it('getSessionPref with malformed JSON returns null', () => {
    store['pref_bad'] = 'not-json';
    expect(getSessionPref('bad')).toBeNull();
  });
  it('does not throw on corrupt storage',              () => expect(()=>getSessionPref('bad')).not.toThrow());
});
