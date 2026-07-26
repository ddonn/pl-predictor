'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { INVITE_CODE, ADMIN_CODE, STAKE_OPTIONS, PL_TEAMS } from '../lib/constants';

// =====================================================================
// STYLE TOKENS
// =====================================================================

const C = {
  bg: '#0b0f14',
  bg2: '#121821',
  card: '#161d27',
  cardAlt: '#1b2330',
  border: '#232c38',
  text: '#e8edf3',
  sub: '#8b98a9',
  accent: '#00d084',
  accentDark: '#00a86b',
  danger: '#ff4d5e',
  warn: '#ffb020',
  gold: '#ffd166',
};

const st = {
  page: { minHeight: '100vh', background: C.bg, color: C.text, paddingBottom: 84 },
  container: { maxWidth: 720, margin: '0 auto', padding: '16px 14px 24px' },
  h1: { fontSize: 22, fontWeight: 800, margin: '4px 0 16px', letterSpacing: -0.3 },
  h2: { fontSize: 17, fontWeight: 700, margin: '0 0 10px' },
  sub: { color: C.sub, fontSize: 14, lineHeight: 1.5 },
  card: {
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  label: { fontSize: 14, color: C.sub, marginBottom: 6, display: 'block', fontWeight: 600 },
  input: {
    width: '100%',
    background: C.bg2,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    color: C.text,
    padding: '12px 12px',
    minHeight: 44,
    fontSize: 16,
    outline: 'none',
  },
  select: {
    width: '100%',
    background: C.bg2,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    color: C.text,
    padding: '12px 12px',
    minHeight: 44,
    fontSize: 16,
    outline: 'none',
    appearance: 'auto',
  },
  errorBox: {
    background: 'rgba(255,77,94,0.12)',
    border: `1px solid ${C.danger}`,
    color: '#ffb3ba',
    borderRadius: 10,
    padding: '10px 12px',
    fontSize: 14,
    marginBottom: 12,
  },
  okBox: {
    background: 'rgba(0,208,132,0.12)',
    border: `1px solid ${C.accent}`,
    color: '#b7f7dd',
    borderRadius: 10,
    padding: '10px 12px',
    fontSize: 14,
    marginBottom: 12,
  },
};

function btnStyle(variant = 'primary', disabled = false) {
  const base = {
    minHeight: 44,
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 14.5,
    border: '1px solid transparent',
    padding: '10px 16px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    opacity: disabled ? 0.5 : 1,
    transition: 'transform 0.05s ease',
  };
  const variants = {
    primary: { background: C.accent, color: '#04140d' },
    secondary: { background: C.cardAlt, color: C.text, border: `1px solid ${C.border}` },
    danger: { background: 'rgba(255,77,94,0.15)', color: '#ff8792', border: `1px solid ${C.danger}` },
    ghost: { background: 'transparent', color: C.sub, border: `1px solid ${C.border}` },
  };
  return { ...base, ...variants[variant] };
}

function Button({ children, onClick, variant = 'primary', disabled, type = 'button', style, fullWidth }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{ ...btnStyle(variant, disabled), width: fullWidth ? '100%' : undefined, ...style }}
    >
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: `3px solid ${C.border}`,
          borderTopColor: C.accent,
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Badge({ children, tone = 'default' }) {
  const tones = {
    default: { background: C.cardAlt, color: C.sub },
    accent: { background: 'rgba(0,208,132,0.15)', color: C.accent },
    danger: { background: 'rgba(255,77,94,0.15)', color: '#ff8792' },
    gold: { background: 'rgba(255,209,102,0.15)', color: C.gold },
  };
  return (
    <span
      style={{
        fontSize: 14,
        fontWeight: 700,
        padding: '3px 8px',
        borderRadius: 999,
        ...tones[tone],
      }}
    >
      {children}
    </span>
  );
}

// =====================================================================
// HELPERS
// =====================================================================

function fmtDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function gameweekLockTime(matches, gw) {
  const gwMatches = matches.filter((m) => m.gameweek === gw);
  if (!gwMatches.length) return null;
  const earliest = Math.min(...gwMatches.map((m) => new Date(m.kickoff).getTime()));
  return new Date(earliest - 60 * 60 * 1000);
}

function seasonLockTime(matches) {
  if (!matches.length) return null;
  const earliest = Math.min(...matches.map((m) => new Date(m.kickoff).getTime()));
  return new Date(earliest - 60 * 60 * 1000);
}

function isPast(dateObj) {
  return !!dateObj && Date.now() >= dateObj.getTime();
}

function getCurrentGameweek(matches) {
  if (!matches.length) return 1;
  const now = Date.now();
  const upcoming = matches
    .filter((m) => new Date(m.kickoff).getTime() > now)
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  if (upcoming.length) return upcoming[0].gameweek;
  return Math.max(...matches.map((m) => m.gameweek));
}

function calcMatchPoints(pred, result) {
  if (!result) return null;
  if (pred.home_score === result.home_score && pred.away_score === result.away_score) return pred.stake;
  const predDiff = Math.sign(pred.home_score - pred.away_score);
  const resDiff = Math.sign(result.home_score - result.away_score);
  if (predDiff === resDiff) return pred.stake / 2;
  return -pred.stake;
}

function outcomeLabel(pts) {
  if (pts === null || pts === undefined) return null;
  if (pts > 0 && Number.isInteger(pts) === false) return { text: 'Correct result', tone: 'gold' };
  if (pts > 0) return { text: 'Correct score', tone: 'accent' };
  if (pts === 0) return { text: 'No points', tone: 'default' };
  return { text: 'Wrong', tone: 'danger' };
}

function countdownText(target) {
  if (!target) return '';
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return 'Locked';
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hrs >= 24) {
    const days = Math.floor(hrs / 24);
    return `Locks in ${days}d ${hrs % 24}h`;
  }
  return `Locks in ${hrs}h ${mins}m`;
}

// =====================================================================
// NUMBER STEPPER (score picker)
// =====================================================================

function NumberStepper({ value, onChange, disabled, label }) {
  const dec = () => onChange(Math.max(0, value - 1));
  const inc = () => onChange(Math.min(19, value + 1));
  return (
    <div style={{ textAlign: 'center' }}>
      {label && <div style={{ fontSize: 14, color: C.sub, marginBottom: 6, fontWeight: 700 }}>{label}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          disabled={disabled}
          onClick={dec}
          style={{
            width: 40,
            height: 44,
            borderRadius: 10,
            border: `1px solid ${C.border}`,
            background: C.bg2,
            color: C.text,
            fontSize: 18,
            fontWeight: 700,
            opacity: disabled ? 0.4 : 1,
          }}
        >
          −
        </button>
        <div
          style={{
            width: 44,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            fontWeight: 800,
            background: C.bg2,
            borderRadius: 10,
            border: `1px solid ${C.border}`,
          }}
        >
          {value}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={inc}
          style={{
            width: 40,
            height: 44,
            borderRadius: 10,
            border: `1px solid ${C.border}`,
            background: C.bg2,
            color: C.text,
            fontSize: 18,
            fontWeight: 700,
            opacity: disabled ? 0.4 : 1,
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}

function StakeSelector({ value, onChange, disabled }) {
  return (
    <div>
      <div style={{ fontSize: 14, color: C.sub, marginBottom: 6, fontWeight: 700 }}>STAKE</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
        {STAKE_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onChange(s)}
            style={{
              minHeight: 44,
              borderRadius: 10,
              fontWeight: 800,
              fontSize: 14,
              border: `1px solid ${value === s ? C.accent : C.border}`,
              background: value === s ? 'rgba(0,208,132,0.18)' : C.bg2,
              color: value === s ? C.accent : C.text,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      style={{
        width: 50,
        height: 30,
        borderRadius: 999,
        border: `1px solid ${checked ? C.accent : C.border}`,
        background: checked ? 'rgba(0,208,132,0.25)' : C.bg2,
        position: 'relative',
        padding: 0,
        flexShrink: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: checked ? 22 : 3,
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: checked ? C.accent : C.sub,
          transition: 'left 0.15s ease',
        }}
      />
    </button>
  );
}

// =====================================================================
// AUTH SCREEN
// =====================================================================

function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setInfo('If an account exists for that email, a password reset link has been sent.');
      } else {
        if (!username.trim()) throw new Error('Please choose a username.');
        if (password.length < 6) throw new Error('Password must be at least 6 characters.');
        const trimmedCode = code.trim();
        let isAdmin;
        if (trimmedCode === ADMIN_CODE) isAdmin = true;
        else if (trimmedCode === INVITE_CODE) isAdmin = false;
        else throw new Error('Invalid invite code.');

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: username.trim(), is_admin: isAdmin } },
        });
        if (error) throw error;
        if (!data.session) {
          setInfo('Account created! Check your email to confirm, then log in.');
          setMode('login');
        }
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...st.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 380, padding: 20 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 34, marginBottom: 4 }}>⚽</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>PL Predictor</div>
          <div style={st.sub}>
            {mode === 'forgot' ? 'Reset your password' : '2026/27 Premier League prediction league'}
          </div>
        </div>

        {mode !== 'forgot' && (
          <div style={{ display: 'flex', background: C.card, borderRadius: 12, padding: 4, marginBottom: 18, border: `1px solid ${C.border}` }}>
            {['login', 'register'].map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setError('');
                  setInfo('');
                }}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 9,
                  fontWeight: 700,
                  fontSize: 14,
                  border: 'none',
                  background: mode === m ? C.accent : 'transparent',
                  color: mode === m ? '#04140d' : C.sub,
                }}
              >
                {m === 'login' ? 'Log In' : 'Register'}
              </button>
            ))}
          </div>
        )}

        {error && <div style={st.errorBox}>{error}</div>}
        {info && <div style={st.okBox}>{info}</div>}

        {mode === 'forgot' && !info && (
          <div style={{ ...st.sub, marginBottom: 16 }}>
            Enter the email address on your account and we'll send you a link to reset your password.
          </div>
        )}

        <form onSubmit={submit}>
          {mode === 'register' && (
            <div style={{ marginBottom: 12 }}>
              <label style={st.label}>Username</label>
              <input style={st.input} value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <label style={st.label}>Email</label>
            <input
              style={st.input}
              type="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {mode !== 'forgot' && (
            <div style={{ marginBottom: 12 }}>
              <label style={st.label}>Password</label>
              <input
                style={st.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          )}
          {mode === 'login' && (
            <div style={{ textAlign: 'right', marginTop: -4, marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => {
                  setMode('forgot');
                  setError('');
                  setInfo('');
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: C.sub,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Forgot password?
              </button>
            </div>
          )}
          {mode === 'register' && (
            <div style={{ marginBottom: 16 }}>
              <label style={st.label}>Invite Code</label>
              <input
                style={st.input}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ask the league admin"
                required
              />
            </div>
          )}
          <Button type="submit" fullWidth disabled={busy}>
            {busy
              ? 'Please wait…'
              : mode === 'login'
              ? 'Log In'
              : mode === 'forgot'
              ? 'Send Reset Link'
              : 'Create Account'}
          </Button>
        </form>

        {mode === 'forgot' && (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
                setInfo('');
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: C.accent,
                fontSize: 13.5,
                fontWeight: 700,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              ← Back to Log In
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ResetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setInfo('Password updated! Taking you back to the app…');
      setTimeout(() => onDone(), 1200);
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <div style={{ ...st.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 380, padding: 20 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 34, marginBottom: 4 }}>🔒</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>Set a New Password</div>
          <div style={st.sub}>Choose a new password for your account.</div>
        </div>

        {error && <div style={st.errorBox}>{error}</div>}
        {info && <div style={st.okBox}>{info}</div>}

        <form onSubmit={submit}>
          <div style={{ marginBottom: 12 }}>
            <label style={st.label}>New Password</label>
            <input
              style={st.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={st.label}>Confirm New Password</label>
            <input
              style={st.input}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" fullWidth disabled={busy}>
            {busy ? 'Please wait…' : 'Set Password'}
          </Button>
        </form>
      </div>
    </div>
  );
}

// =====================================================================
// NAV
// =====================================================================

function NavBar({ tabs, active, onChange, variant }) {
  const isBottom = variant === 'bottom';
  return (
    <nav
      className={isBottom ? 'nav-bottom' : 'nav-top'}
      style={
        isBottom
          ? {
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              background: C.card,
              borderTop: `1px solid ${C.border}`,
              justifyContent: 'space-around',
              padding: '6px 4px',
              paddingBottom: 'max(6px, env(safe-area-inset-bottom))',
              zIndex: 20,
            }
          : {
              position: 'sticky',
              top: 0,
              background: 'rgba(11,15,20,0.92)',
              backdropFilter: 'blur(8px)',
              borderBottom: `1px solid ${C.border}`,
              padding: '10px 20px',
              gap: 4,
              zIndex: 20,
              justifyContent: 'center',
            }
      }
    >
      {tabs.map((t) => {
        const activeTab = active === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={
              isBottom
                ? {
                    flex: 1,
                    minWidth: 0,
                    minHeight: 48,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    background: 'transparent',
                    border: 'none',
                    color: activeTab ? C.accent : C.sub,
                    fontSize: 14,
                    fontWeight: 700,
                    padding: '0 2px',
                  }
                : {
                    minHeight: 44,
                    padding: '8px 16px',
                    borderRadius: 9,
                    border: 'none',
                    background: activeTab ? 'rgba(0,208,132,0.15)' : 'transparent',
                    color: activeTab ? C.accent : C.sub,
                    fontSize: 14,
                    fontWeight: 700,
                  }
            }
          >
            <span style={{ fontSize: isBottom ? 18 : 15 }}>{t.icon}</span>
            <span
              style={
                isBottom
                  ? { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
                  : undefined
              }
            >
              {isBottom ? t.shortLabel || t.label : t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// =====================================================================
// FIXTURES TAB
// =====================================================================

function MatchCard({ match, prediction, locked, onSave, saving }) {
  const [home, setHome] = useState(prediction ? prediction.home_score : 1);
  const [away, setAway] = useState(prediction ? prediction.away_score : 1);
  const [stake, setStake] = useState(prediction ? prediction.stake : 20);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (prediction) {
      setHome(prediction.home_score);
      setAway(prediction.away_score);
      setStake(prediction.stake);
    }
    setDirty(false);
  }, [prediction?.home_score, prediction?.away_score, prediction?.stake, match.id]);

  const update = (setter) => (v) => {
    setter(v);
    setDirty(true);
  };

  return (
    <div style={st.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <Badge>GW{match.gameweek}</Badge>
        <span style={{ fontSize: 14, color: C.sub }}>{fmtDateTime(match.kickoff)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ flex: 1, fontWeight: 700, fontSize: 14.5, textAlign: 'right', paddingRight: 8 }}>{match.home}</div>
        <div style={{ fontSize: 14, color: C.sub, fontWeight: 700, padding: '0 4px' }}>vs</div>
        <div style={{ flex: 1, fontWeight: 700, fontSize: 14.5, textAlign: 'left', paddingLeft: 8 }}>{match.away}</div>
      </div>
      {match.stadium && (
        <div style={{ textAlign: 'center', fontSize: 14, color: C.sub, marginBottom: 10 }}>{match.stadium}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 14 }}>
        <NumberStepper value={home} onChange={update(setHome)} disabled={locked} label={match.home.slice(0, 3).toUpperCase()} />
        <div style={{ fontSize: 22, fontWeight: 800, color: C.sub, alignSelf: 'center', marginTop: 14 }}>:</div>
        <NumberStepper value={away} onChange={update(setAway)} disabled={locked} label={match.away.slice(0, 3).toUpperCase()} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <StakeSelector value={stake} onChange={update(setStake)} disabled={locked} />
      </div>
      {locked ? (
        <div style={{ textAlign: 'center' }}>
          <Badge tone="danger">🔒 Locked</Badge>
          {prediction && (
            <div style={{ marginTop: 8, fontSize: 14, color: C.sub }}>
              Your pick: {prediction.home_score}-{prediction.away_score} (stake {prediction.stake})
            </div>
          )}
        </div>
      ) : (
        <Button
          fullWidth
          disabled={!dirty || saving}
          onClick={() => {
            onSave(match, { home_score: home, away_score: away, stake });
            setDirty(false);
          }}
        >
          {saving ? 'Saving…' : prediction ? 'Update Pick' : 'Save Pick'}
        </Button>
      )}
    </div>
  );
}

const ALL_GAMEWEEKS = Array.from({ length: 38 }, (_, i) => i + 1);

function FixturesTab({ profile }) {
  const [matches, setMatches] = useState([]);
  const [predictions, setPredictions] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [msg, setMsg] = useState('');
  const [selectedGw, setSelectedGw] = useState(null);
  const [optedIn, setOptedIn] = useState(false);
  const [optInBusy, setOptInBusy] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const { data: allMatches } = await supabase.from('matches').select('*').order('kickoff', { ascending: true });
    setMatches(allMatches || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const currentGw = useMemo(() => getCurrentGameweek(matches), [matches]);

  useEffect(() => {
    if (selectedGw == null && matches.length) setSelectedGw(currentGw);
  }, [currentGw, matches, selectedGw]);

  const gwMatches = useMemo(
    () =>
      selectedGw == null
        ? []
        : matches.filter((m) => m.gameweek === selectedGw).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff)),
    [matches, selectedGw]
  );
  const lockTime = useMemo(() => (selectedGw == null ? null : gameweekLockTime(matches, selectedGw)), [matches, selectedGw]);
  const locked = isPast(lockTime);

  useEffect(() => {
    if (!gwMatches.length || !profile) {
      setPredictions({});
      return;
    }
    (async () => {
      const ids = gwMatches.map((m) => m.id);
      const { data } = await supabase.from('predictions').select('*').eq('user_id', profile.id).in('match_id', ids);
      const map = {};
      (data || []).forEach((p) => (map[p.match_id] = p));
      setPredictions(map);
    })();
  }, [gwMatches, profile]);

  useEffect(() => {
    if (selectedGw == null || !profile) return;
    (async () => {
      const { data } = await supabase
        .from('gameweek_entries')
        .select('gameweek')
        .eq('user_id', profile.id)
        .eq('gameweek', selectedGw)
        .maybeSingle();
      setOptedIn(!!data);
    })();
  }, [selectedGw, profile]);

  const toggleOptIn = async () => {
    if (!profile || selectedGw == null) return;
    setOptInBusy(true);
    setMsg('');
    if (optedIn) {
      const { error } = await supabase
        .from('gameweek_entries')
        .delete()
        .eq('user_id', profile.id)
        .eq('gameweek', selectedGw);
      if (error) setMsg(`Error: ${error.message}`);
      else setOptedIn(false);
    } else {
      const { error } = await supabase.from('gameweek_entries').insert({ user_id: profile.id, gameweek: selectedGw });
      if (error) setMsg(`Error: ${error.message}`);
      else setOptedIn(true);
    }
    setOptInBusy(false);
  };

  const savePick = async (match, pick) => {
    setSavingId(match.id);
    setMsg('');
    const payload = {
      user_id: profile.id,
      match_id: match.id,
      gameweek: match.gameweek,
      home_score: pick.home_score,
      away_score: pick.away_score,
      stake: pick.stake,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('predictions')
      .upsert(payload, { onConflict: 'user_id,match_id' })
      .select()
      .single();
    if (error) {
      setMsg(`Error: ${error.message}`);
    } else {
      setPredictions((prev) => ({ ...prev, [match.id]: data }));
      setMsg('Pick saved!');
      setTimeout(() => setMsg(''), 2000);
    }
    setSavingId(null);
  };

  if (loading || selectedGw == null) return <Spinner />;

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <select style={st.select} value={selectedGw} onChange={(e) => setSelectedGw(Number(e.target.value))}>
          {ALL_GAMEWEEKS.map((gw) => (
            <option key={gw} value={gw}>
              Gameweek {gw}
              {gw === currentGw ? ' (current)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={st.h1}>Gameweek {selectedGw}</div>
        <Badge tone={locked ? 'danger' : 'accent'}>{countdownText(lockTime)}</Badge>
      </div>
      <div style={{ ...st.sub, marginBottom: 16 }}>
        Pick a scoreline and a stake for every match. Exact score wins the full stake, correct result (win/draw/loss)
        wins half, wrong pays it back out of your total.
      </div>

      <div style={{ ...st.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>I am playing this Gameweek</div>
          <div style={st.sub}>Opt in so your picks count towards Gameweek {selectedGw}'s results and leaderboard.</div>
        </div>
        <ToggleSwitch checked={optedIn} disabled={optInBusy || locked} onChange={toggleOptIn} />
      </div>

      {msg && <div style={msg.startsWith('Error') ? st.errorBox : st.okBox}>{msg}</div>}
      {!gwMatches.length && <div style={st.sub}>No fixtures scheduled for this gameweek yet.</div>}
      {gwMatches.map((m) => (
        <MatchCard
          key={m.id}
          match={m}
          prediction={predictions[m.id]}
          locked={locked}
          saving={savingId === m.id}
          onSave={savePick}
        />
      ))}
    </div>
  );
}

// =====================================================================
// PREVIOUS RESULTS TAB
// =====================================================================

function ResultsTab({ profile }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGw, setSelectedGw] = useState(null);
  const [gwMatches, setGwMatches] = useState([]);
  const [results, setResults] = useState({});
  const [allPreds, setAllPreds] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loadingGw, setLoadingGw] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('matches').select('*').order('kickoff', { ascending: true });
      setMatches(data || []);
      const currentGw = getCurrentGameweek(data || []);
      const past = (data || []).filter((m) => m.gameweek < currentGw);
      const gws = [...new Set(past.map((m) => m.gameweek))].sort((a, b) => b - a);
      setSelectedGw(gws[0] ?? null);
      setLoading(false);
    })();
  }, []);

  const pastGameweeks = useMemo(() => {
    const currentGw = getCurrentGameweek(matches);
    return [...new Set(matches.filter((m) => m.gameweek < currentGw).map((m) => m.gameweek))].sort((a, b) => b - a);
  }, [matches]);

  useEffect(() => {
    if (selectedGw == null) return;
    (async () => {
      setLoadingGw(true);
      const gm = matches.filter((m) => m.gameweek === selectedGw).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
      setGwMatches(gm);
      const ids = gm.map((m) => m.id);
      if (ids.length) {
        const [{ data: res }, { data: preds }, { data: profs }, { data: entries }] = await Promise.all([
          supabase.from('results').select('*').in('match_id', ids),
          supabase.from('predictions').select('*').in('match_id', ids),
          supabase.from('profiles').select('id, username'),
          supabase.from('gameweek_entries').select('user_id').eq('gameweek', selectedGw),
        ]);
        const resMap = {};
        (res || []).forEach((r) => (resMap[r.match_id] = r));
        setResults(resMap);
        const optedInIds = new Set((entries || []).map((e) => e.user_id));
        setAllPreds((preds || []).filter((p) => optedInIds.has(p.user_id)));
        const profMap = {};
        (profs || []).forEach((p) => (profMap[p.id] = p.username));
        setProfiles(profMap);
      } else {
        setResults({});
        setAllPreds([]);
      }
      setLoadingGw(false);
    })();
  }, [selectedGw, matches]);

  if (loading) return <Spinner />;
  if (!pastGameweeks.length) {
    return (
      <div>
        <div style={st.h1}>Previous Results</div>
        <div style={st.sub}>No completed gameweeks yet — check back after the first round of matches.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={st.h1}>Previous Results</div>
      <div style={{ marginBottom: 16 }}>
        <select style={st.select} value={selectedGw ?? ''} onChange={(e) => setSelectedGw(Number(e.target.value))}>
          {pastGameweeks.map((gw) => (
            <option key={gw} value={gw}>
              Gameweek {gw}
            </option>
          ))}
        </select>
      </div>
      {loadingGw ? (
        <Spinner />
      ) : (
        gwMatches.map((m) => {
          const result = results[m.id];
          const matchPreds = allPreds.filter((p) => p.match_id === m.id).sort((a, b) => {
            if (a.user_id === profile.id) return -1;
            if (b.user_id === profile.id) return 1;
            return (profiles[a.user_id] || '').localeCompare(profiles[b.user_id] || '');
          });
          return (
            <div key={m.id} style={st.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 14, color: C.sub }}>{fmtDateTime(m.kickoff)}</span>
                {!result && <Badge tone="default">Awaiting result</Badge>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 12 }}>
                <div style={{ flex: 1, textAlign: 'right', fontWeight: 700, fontSize: 15 }}>{m.home}</div>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 20,
                    background: C.bg2,
                    borderRadius: 10,
                    padding: '6px 14px',
                    border: `1px solid ${C.border}`,
                  }}
                >
                  {result ? `${result.home_score} - ${result.away_score}` : '-  -  -'}
                </div>
                <div style={{ flex: 1, textAlign: 'left', fontWeight: 700, fontSize: 15 }}>{m.away}</div>
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                {matchPreds.length === 0 && <div style={{ ...st.sub, textAlign: 'center' }}>No picks made.</div>}
                {matchPreds.map((p) => {
                  const pts = calcMatchPoints(p, result);
                  const label = outcomeLabel(pts);
                  const isMe = p.user_id === profile.id;
                  return (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 0',
                        fontWeight: isMe ? 700 : 400,
                      }}
                    >
                      <span style={{ fontSize: 13.5 }}>
                        {isMe ? 'You' : profiles[p.user_id] || 'Player'}{' '}
                        <span style={{ color: C.sub, fontWeight: 400 }}>
                          picked {p.home_score}-{p.away_score} (stake {p.stake})
                        </span>
                      </span>
                      {label && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Badge tone={label.tone}>{label.text}</Badge>
                          <span
                            style={{
                              fontWeight: 800,
                              fontSize: 14,
                              color: pts > 0 ? C.accent : pts < 0 ? C.danger : C.sub,
                              minWidth: 34,
                              textAlign: 'right',
                            }}
                          >
                            {pts > 0 ? '+' : ''}
                            {pts}
                          </span>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// =====================================================================
// PRE-SEASON PICKS TAB
// =====================================================================

function PreSeasonTab({ profile }) {
  const [matches, setMatches] = useState([]);
  const [mine, setMine] = useState(null);
  const [plWinner, setPlWinner] = useState('');
  const [bottomTeam, setBottomTeam] = useState('');
  const [topScorer, setTopScorer] = useState('');
  const [tournamentResult, setTournamentResult] = useState(null);
  const [everyone, setEveryone] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const [{ data: m }, { data: own }, { data: tr }] = await Promise.all([
        supabase.from('matches').select('id, kickoff'),
        supabase.from('tournament_predictions').select('*').eq('user_id', profile.id).maybeSingle(),
        supabase.from('tournament_results').select('*').eq('id', 1).maybeSingle(),
      ]);
      setMatches(m || []);
      if (own) {
        setMine(own);
        setPlWinner(own.pl_winner || '');
        setBottomTeam(own.bottom_team || '');
        setTopScorer(own.top_scorer || '');
      }
      setTournamentResult(tr || null);
      setLoading(false);
    })();
  }, [profile.id]);

  const lockTime = useMemo(() => seasonLockTime(matches), [matches]);
  const locked = isPast(lockTime);

  useEffect(() => {
    if (!locked) return;
    (async () => {
      const [{ data: all }, { data: profs }] = await Promise.all([
        supabase.from('tournament_predictions').select('*'),
        supabase.from('profiles').select('id, username'),
      ]);
      setEveryone(all || []);
      const map = {};
      (profs || []).forEach((p) => (map[p.id] = p.username));
      setProfiles(map);
    })();
  }, [locked]);

  const save = async () => {
    setSaving(true);
    setMsg('');
    const payload = {
      user_id: profile.id,
      pl_winner: plWinner || null,
      bottom_team: bottomTeam || null,
      top_scorer: topScorer.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('tournament_predictions')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();
    if (error) setMsg(`Error: ${error.message}`);
    else {
      setMine(data);
      setMsg('Saved!');
      setTimeout(() => setMsg(''), 2000);
    }
    setSaving(false);
  };

  const preseasonPoints = (pred) => {
    if (!tournamentResult) return 0;
    let pts = 0;
    if (tournamentResult.pl_winner && pred.pl_winner === tournamentResult.pl_winner) pts += 50;
    if (tournamentResult.bottom_team && pred.bottom_team === tournamentResult.bottom_team) pts += 50;
    if (tournamentResult.top_scorer && pred.top_scorer === tournamentResult.top_scorer) {
      pts += 50 + (tournamentResult.top_scorer_goals || 0);
    }
    return pts;
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={st.h1}>Pre-Season Picks</div>
        <Badge tone={locked ? 'danger' : 'accent'}>{countdownText(lockTime)}</Badge>
      </div>
      <div style={{ ...st.sub, marginBottom: 16 }}>
        PL Winner: 50pts if exactly right (a near-miss top-4 bonus may be added manually by the admin). Bottom Team:
        50pts if exactly right (relegation near-miss handled the same way). Top Scorer: 50pts if correct, plus 1pt per
        goal your pick actually scored.
      </div>
      {msg && <div style={msg.startsWith('Error') ? st.errorBox : st.okBox}>{msg}</div>}

      <div style={st.card}>
        <div style={{ marginBottom: 14 }}>
          <label style={st.label}>Premier League Winner</label>
          <select style={st.select} value={plWinner} onChange={(e) => setPlWinner(e.target.value)} disabled={locked}>
            <option value="">Select a team…</option>
            {PL_TEAMS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={st.label}>Bottom of the Table</label>
          <select style={st.select} value={bottomTeam} onChange={(e) => setBottomTeam(e.target.value)} disabled={locked}>
            <option value="">Select a team…</option>
            {PL_TEAMS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: locked ? 0 : 16 }}>
          <label style={st.label}>Top Scorer</label>
          <input
            style={st.input}
            value={topScorer}
            onChange={(e) => setTopScorer(e.target.value)}
            placeholder="Player name"
            disabled={locked}
          />
        </div>
        {!locked && (
          <Button fullWidth onClick={save} disabled={saving} style={{ marginTop: 16 }}>
            {saving ? 'Saving…' : mine ? 'Update Picks' : 'Save Picks'}
          </Button>
        )}
      </div>

      {tournamentResult && mine && (
        <div style={{ ...st.card, borderColor: C.accent }}>
          <div style={st.h2}>Your Pre-Season Points</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.accent }}>+{preseasonPoints(mine)}</div>
        </div>
      )}

      {locked && everyone.length > 0 && (
        <div style={st.card}>
          <div style={st.h2}>Everyone's Picks</div>
          {everyone.map((p) => (
            <div key={p.user_id} style={{ padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                {p.user_id === profile.id ? 'You' : profiles[p.user_id] || 'Player'}
              </div>
              <div style={{ fontSize: 14, color: C.sub }}>
                Winner: {p.pl_winner || '—'} · Bottom: {p.bottom_team || '—'} · Top Scorer: {p.top_scorer || '—'}
                {tournamentResult && <span style={{ color: C.accent, fontWeight: 700 }}> · +{preseasonPoints(p)}pts</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// LEADERBOARD TAB
// =====================================================================

function LeaderboardTab({ profile }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_leaderboard');
    if (!error) setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={st.h1}>Leaderboard</div>
        <Button variant="secondary" onClick={load}>
          ↻ Refresh
        </Button>
      </div>
      <div style={st.card}>
        {rows.length === 0 && <div style={st.sub}>No players yet.</div>}
        {rows.map((r, i) => {
          const isMe = r.user_id === profile.id;
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
          return (
            <div
              key={r.user_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 4px',
                borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : 'none',
                background: isMe ? 'rgba(0,208,132,0.08)' : 'transparent',
                borderRadius: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 26, textAlign: 'center', fontWeight: 800, color: C.sub, fontSize: 14 }}>
                  {medal || `#${i + 1}`}
                </div>
                <div style={{ fontWeight: isMe ? 800 : 600, fontSize: 14.5 }}>
                  {r.username} {isMe && <span style={{ color: C.accent }}>(you)</span>}
                </div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 16, color: Number(r.total_points) < 0 ? C.danger : C.text }}>
                {r.total_points}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =====================================================================
// RULES TAB
// =====================================================================

function RulesTab() {
  const Rule = ({ title, children }) => (
    <div style={st.card}>
      <div style={st.h2}>{title}</div>
      <div style={st.sub}>{children}</div>
    </div>
  );
  return (
    <div>
      <div style={st.h1}>How to Play</div>
      <Rule title="⚽ Match Predictions">
        For every fixture, pick an exact scoreline and a stake of 10, 20, 30, 40 or 50 points.
        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          <li>Exact score correct → win your full stake.</li>
          <li>Correct result only (right winner or draw, wrong score) → win half your stake.</li>
          <li>Wrong result → lose your stake (deducted from your running total).</li>
        </ul>
      </Rule>
      <Rule title="🔒 Lockout">
        All predictions for a gameweek lock 1 hour before the first match of that gameweek kicks off. After lockout
        you can see everyone else's picks for that round in Previous Results.
      </Rule>
      <Rule title="🏆 Pre-Season Picks">
        Before Gameweek 1 kicks off, predict the Premier League Winner, the team that finishes bottom of the table,
        and the season's Top Scorer.
        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          <li>PL Winner: 50pts if correct (a smaller bonus may be awarded manually for a top-4 finish).</li>
          <li>Bottom Team: 50pts if correct (a smaller bonus may be awarded manually for relegation).</li>
          <li>Top Scorer: 50pts if correct, plus 1pt for every goal your pick scores — regardless of whether they win the Golden Boot.</li>
        </ul>
        These also lock 1 hour before Gameweek 1's first kick-off.
      </Rule>
      <Rule title="📊 Leaderboard">
        Your running total is the sum of every match result (win, half-win or loss of your stake), your pre-season
        bonus points, and any manual adjustments made by the admin.
      </Rule>
    </div>
  );
}

// =====================================================================
// ADMIN PANEL
// =====================================================================

function AdminEnterResults({ allMatches, reload }) {
  const gameweeks = useMemo(() => [...new Set(allMatches.map((m) => m.gameweek))].sort((a, b) => a - b), [allMatches]);
  const [gw, setGw] = useState(gameweeks[0] || 1);
  const [scores, setScores] = useState({});
  const [existing, setExisting] = useState({});
  const [msg, setMsg] = useState('');
  const [savingId, setSavingId] = useState(null);

  const gwMatches = useMemo(
    () => allMatches.filter((m) => m.gameweek === gw).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff)),
    [allMatches, gw]
  );

  useEffect(() => {
    (async () => {
      const ids = gwMatches.map((m) => m.id);
      if (!ids.length) return;
      const { data } = await supabase.from('results').select('*').in('match_id', ids);
      const map = {};
      (data || []).forEach((r) => (map[r.match_id] = r));
      setExisting(map);
    })();
  }, [gwMatches]);

  const save = async (matchId) => {
    const val = scores[matchId] || existing[matchId] || { home_score: 0, away_score: 0 };
    setSavingId(matchId);
    const { data, error } = await supabase
      .from('results')
      .upsert({ match_id: matchId, home_score: val.home_score, away_score: val.away_score }, { onConflict: 'match_id' })
      .select()
      .single();
    if (error) setMsg(`Error: ${error.message}`);
    else {
      setExisting((prev) => ({ ...prev, [matchId]: data }));
      setMsg('Result saved — leaderboard updated.');
      reload();
      setTimeout(() => setMsg(''), 2500);
    }
    setSavingId(null);
  };

  return (
    <div>
      <select style={{ ...st.select, marginBottom: 14 }} value={gw} onChange={(e) => setGw(Number(e.target.value))}>
        {gameweeks.map((g) => (
          <option key={g} value={g}>
            Gameweek {g}
          </option>
        ))}
      </select>
      {msg && <div style={st.okBox}>{msg}</div>}
      {gwMatches.map((m) => {
        const cur = scores[m.id] || existing[m.id] || { home_score: 0, away_score: 0 };
        return (
          <div key={m.id} style={st.card}>
            <div style={{ fontSize: 14, color: C.sub, marginBottom: 8 }}>{fmtDateTime(m.kickoff)}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 12 }}>
              <div style={{ flex: 1, textAlign: 'right', fontWeight: 700 }}>{m.home}</div>
              <NumberStepper
                value={cur.home_score}
                onChange={(v) => setScores((s) => ({ ...s, [m.id]: { ...cur, home_score: v } }))}
              />
              <span style={{ fontWeight: 800 }}>-</span>
              <NumberStepper
                value={cur.away_score}
                onChange={(v) => setScores((s) => ({ ...s, [m.id]: { ...cur, away_score: v } }))}
              />
              <div style={{ flex: 1, textAlign: 'left', fontWeight: 700 }}>{m.away}</div>
            </div>
            <Button fullWidth onClick={() => save(m.id)} disabled={savingId === m.id}>
              {existing[m.id] ? 'Update Result' : 'Save Result'}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function AdminEditMatches({ allMatches, reload }) {
  const gameweeks = useMemo(() => [...new Set(allMatches.map((m) => m.gameweek))].sort((a, b) => a - b), [allMatches]);
  const [gw, setGw] = useState(gameweeks[0] || 1);
  const [edits, setEdits] = useState({});
  const [msg, setMsg] = useState('');
  const [savingId, setSavingId] = useState(null);

  const gwMatches = useMemo(
    () => allMatches.filter((m) => m.gameweek === gw).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff)),
    [allMatches, gw]
  );

  const toLocalInput = (iso) => {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const save = async (match) => {
    const e = edits[match.id] || {};
    setSavingId(match.id);
    const payload = {
      home: e.home ?? match.home,
      away: e.away ?? match.away,
      stadium: e.stadium ?? match.stadium,
      kickoff: e.kickoff ? new Date(e.kickoff).toISOString() : match.kickoff,
    };
    const { error } = await supabase.from('matches').update(payload).eq('id', match.id);
    if (error) setMsg(`Error: ${error.message}`);
    else {
      setMsg('Match updated.');
      reload();
      setTimeout(() => setMsg(''), 2000);
    }
    setSavingId(null);
  };

  return (
    <div>
      <select style={{ ...st.select, marginBottom: 14 }} value={gw} onChange={(e) => setGw(Number(e.target.value))}>
        {gameweeks.map((g) => (
          <option key={g} value={g}>
            Gameweek {g}
          </option>
        ))}
      </select>
      {msg && <div style={st.okBox}>{msg}</div>}
      {gwMatches.map((m) => {
        const e = edits[m.id] || {};
        return (
          <div key={m.id} style={st.card}>
            <div style={{ marginBottom: 10 }}>
              <label style={st.label}>Home Team</label>
              <input
                style={st.input}
                defaultValue={m.home}
                onChange={(ev) => setEdits((s) => ({ ...s, [m.id]: { ...s[m.id], home: ev.target.value } }))}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={st.label}>Away Team</label>
              <input
                style={st.input}
                defaultValue={m.away}
                onChange={(ev) => setEdits((s) => ({ ...s, [m.id]: { ...s[m.id], away: ev.target.value } }))}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={st.label}>Kickoff</label>
              <input
                style={st.input}
                type="datetime-local"
                defaultValue={toLocalInput(m.kickoff)}
                onChange={(ev) => setEdits((s) => ({ ...s, [m.id]: { ...s[m.id], kickoff: ev.target.value } }))}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={st.label}>Stadium</label>
              <input
                style={st.input}
                defaultValue={m.stadium || ''}
                onChange={(ev) => setEdits((s) => ({ ...s, [m.id]: { ...s[m.id], stadium: ev.target.value } }))}
              />
            </div>
            <Button fullWidth onClick={() => save(m)} disabled={savingId === m.id || !edits[m.id]}>
              Save Changes
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function AdminAdjustPoints({ allMatches, reload }) {
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState('');
  const [matchId, setMatchId] = useState('');
  const [points, setPoints] = useState('');
  const [note, setNote] = useState('');
  const [history, setHistory] = useState([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from('points_adjustments')
      .select('*, profiles(username), matches(home, away, gameweek)')
      .order('created_at', { ascending: false })
      .limit(50);
    setHistory(data || []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('profiles').select('id, username').order('username');
      setUsers(data || []);
      if (data?.length) setUserId(data[0].id);
    })();
    loadHistory();
  }, [loadHistory]);

  const submit = async () => {
    if (!userId || points === '') {
      setMsg('Error: pick a user and enter a points value.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('points_adjustments').insert({
      user_id: userId,
      match_id: matchId || null,
      points: Number(points),
      note: note.trim() || null,
    });
    if (error) setMsg(`Error: ${error.message}`);
    else {
      setMsg('Adjustment applied — leaderboard updated.');
      setPoints('');
      setNote('');
      loadHistory();
      reload();
      setTimeout(() => setMsg(''), 2500);
    }
    setBusy(false);
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this adjustment?')) return;
    await supabase.from('points_adjustments').delete().eq('id', id);
    loadHistory();
    reload();
  };

  return (
    <div>
      <div style={st.card}>
        <div style={{ marginBottom: 10 }}>
          <label style={st.label}>User</label>
          <select style={st.select} value={userId} onChange={(e) => setUserId(e.target.value)}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={st.label}>Match (optional)</label>
          <select style={st.select} value={matchId} onChange={(e) => setMatchId(e.target.value)}>
            <option value="">— General / season adjustment —</option>
            {allMatches.map((m) => (
              <option key={m.id} value={m.id}>
                GW{m.gameweek}: {m.home} vs {m.away}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={st.label}>Points (can be negative)</label>
          <input style={st.input} type="number" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="e.g. 20 or -10" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={st.label}>Note</label>
          <input style={st.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Top 4 finish bonus" />
        </div>
        {msg && <div style={msg.startsWith('Error') ? st.errorBox : st.okBox}>{msg}</div>}
        <Button fullWidth onClick={submit} disabled={busy}>
          Apply Adjustment
        </Button>
      </div>

      <div style={st.h2}>Recent Adjustments</div>
      {history.map((h) => (
        <div key={h.id} style={{ ...st.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{h.profiles?.username || 'Unknown'}</div>
            <div style={{ fontSize: 14, color: C.sub }}>
              {h.matches ? `GW${h.matches.gameweek}: ${h.matches.home} vs ${h.matches.away}` : 'General'}
              {h.note ? ` · ${h.note}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 800, color: h.points >= 0 ? C.accent : C.danger }}>
              {h.points > 0 ? '+' : ''}
              {h.points}
            </span>
            <Button variant="danger" onClick={() => remove(h.id)} style={{ minHeight: 44, minWidth: 44, padding: '6px 10px' }}>
              ✕
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminUsers({ session }) {
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState({});
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at');
    setUsers(data || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveUsername = async (id) => {
    const val = editing[id];
    if (!val || !val.trim()) return;
    const { error } = await supabase.from('profiles').update({ username: val.trim() }).eq('id', id);
    if (error) setMsg(`Error: ${error.message}`);
    else {
      setMsg('Username updated.');
      load();
      setTimeout(() => setMsg(''), 2000);
    }
  };

  const deleteUser = async (id, username) => {
    if (!window.confirm(`Delete ${username}? This removes their account and all picks permanently.`)) return;
    const res = await fetch('/api/admin/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ userId: id }),
    });
    const body = await res.json();
    if (!res.ok) setMsg(`Error: ${body.error}`);
    else {
      setMsg('User deleted.');
      load();
      setTimeout(() => setMsg(''), 2000);
    }
  };

  return (
    <div>
      {msg && <div style={msg.startsWith('Error') ? st.errorBox : st.okBox}>{msg}</div>}
      {users.map((u) => (
        <div key={u.id} style={st.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {u.is_admin && <Badge tone="gold">ADMIN</Badge>}
              <span style={{ fontSize: 14, color: C.sub }}>Joined {fmtDate(u.created_at)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              style={{ ...st.input, flex: 1 }}
              defaultValue={u.username}
              onChange={(e) => setEditing((s) => ({ ...s, [u.id]: e.target.value }))}
            />
            <Button variant="secondary" onClick={() => saveUsername(u.id)} style={{ minWidth: 70 }}>
              Save
            </Button>
          </div>
          <Button variant="danger" fullWidth onClick={() => deleteUser(u.id, u.username)}>
            Delete User
          </Button>
        </div>
      ))}
    </div>
  );
}

function AdminGameweekOptIns() {
  const [counts, setCounts] = useState({});
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: entries }, { count }] = await Promise.all([
        supabase.from('gameweek_entries').select('gameweek'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
      ]);
      const map = {};
      (entries || []).forEach((e) => {
        map[e.gameweek] = (map[e.gameweek] || 0) + 1;
      });
      setCounts(map);
      setTotalUsers(count || 0);
      setLoading(false);
    })();
  }, []);

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ ...st.sub, marginBottom: 12 }}>
        Players who have opted in ("I am playing this Gameweek") per gameweek, out of {totalUsers} total players.
      </div>
      <div style={st.card}>
        {ALL_GAMEWEEKS.map((gw) => (
          <div
            key={gw}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 0',
              borderBottom: gw < 38 ? `1px solid ${C.border}` : 'none',
            }}
          >
            <span style={{ fontWeight: 700 }}>Gameweek {gw}</span>
            <Badge tone={counts[gw] ? 'accent' : 'default'}>
              {counts[gw] || 0} / {totalUsers}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminPanel({ session }) {
  const [sub, setSub] = useState('results');
  const [allMatches, setAllMatches] = useState([]);

  const loadMatches = useCallback(async () => {
    const { data } = await supabase.from('matches').select('*').order('kickoff', { ascending: true });
    setAllMatches(data || []);
  }, []);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  const subTabs = [
    { key: 'results', label: 'Enter Results' },
    { key: 'matches', label: 'Edit Matches' },
    { key: 'points', label: 'Adjust Points' },
    { key: 'users', label: 'Users' },
    { key: 'optins', label: 'Gameweek Opt-Ins' },
  ];

  return (
    <div>
      <div style={st.h1}>Admin Panel</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {subTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            style={{
              minHeight: 44,
              padding: '8px 14px',
              borderRadius: 9,
              border: `1px solid ${sub === t.key ? C.accent : C.border}`,
              background: sub === t.key ? 'rgba(0,208,132,0.15)' : C.card,
              color: sub === t.key ? C.accent : C.sub,
              fontSize: 14,
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === 'results' && <AdminEnterResults allMatches={allMatches} reload={loadMatches} />}
      {sub === 'matches' && <AdminEditMatches allMatches={allMatches} reload={loadMatches} />}
      {sub === 'points' && <AdminAdjustPoints allMatches={allMatches} reload={loadMatches} />}
      {sub === 'users' && <AdminUsers session={session} />}
      {sub === 'optins' && <AdminGameweekOptIns />}
    </div>
  );
}

// =====================================================================
// PROFILE
// =====================================================================

function ProfileTab({ profile, session }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const changePassword = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: currentPassword,
      });
      if (verifyError) throw new Error('Current password is incorrect.');

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      setInfo('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={st.h1}>Profile</div>

      <div style={st.card}>
        <div style={st.h2}>Account</div>
        <div style={{ marginBottom: 10 }}>
          <div style={st.label}>Username</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{profile.username}</div>
        </div>
        <div>
          <div style={st.label}>Email</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{session.user.email}</div>
        </div>
      </div>

      <div style={st.card}>
        <div style={st.h2}>Change Password</div>
        {error && <div style={st.errorBox}>{error}</div>}
        {info && <div style={st.okBox}>{info}</div>}
        <form onSubmit={changePassword}>
          <div style={{ marginBottom: 12 }}>
            <label style={st.label}>Current Password</label>
            <input
              style={st.input}
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={st.label}>New Password</label>
            <input
              style={st.input}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={st.label}>Confirm New Password</label>
            <input
              style={st.input}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" fullWidth disabled={busy}>
            {busy ? 'Updating…' : 'Update Password'}
          </Button>
        </form>
      </div>
    </div>
  );
}

// =====================================================================
// ROOT APP
// =====================================================================

const BASE_TABS = [
  { key: 'fixtures', label: 'Fixtures', shortLabel: 'Fixtures', icon: '⚽' },
  { key: 'results', label: 'Previous Results', shortLabel: 'Results', icon: '📊' },
  { key: 'preseason', label: 'Pre-Season Picks', shortLabel: 'Season', icon: '🏆' },
  { key: 'leaderboard', label: 'Leaderboard', shortLabel: 'Table', icon: '🥇' },
  { key: 'rules', label: 'Rules', shortLabel: 'Rules', icon: '📖' },
  { key: 'profile', label: 'Profile', shortLabel: 'Profile', icon: '👤' },
];

export default function Page() {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [activeTab, setActiveTab] = useState('fixtures');
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    setLoadingProfile(true);
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        setProfile(data || null);
        setLoadingProfile(false);
      });
  }, [session?.user?.id]);

  if (session === undefined) {
    return (
      <div style={st.page}>
        <Spinner />
      </div>
    );
  }

  if (recoveryMode) return <ResetPasswordScreen onDone={() => setRecoveryMode(false)} />;

  if (!session) return <AuthScreen />;

  if (loadingProfile || !profile) {
    return (
      <div style={st.page}>
        <Spinner />
      </div>
    );
  }

  const tabs = profile.is_admin
    ? [...BASE_TABS, { key: 'admin', label: 'Admin', shortLabel: 'Admin', icon: '🛠️' }]
    : BASE_TABS;

  return (
    <div style={st.page}>
      <NavBar variant="top" tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div style={st.container}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 10 }}>
          <div style={{ fontSize: 14, color: C.sub }}>
            Signed in as <strong style={{ color: C.text }}>{profile.username}</strong>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{ ...btnStyle('ghost'), minHeight: 44, padding: '4px 12px', fontSize: 14 }}
          >
            Log Out
          </button>
        </div>
        {activeTab === 'fixtures' && <FixturesTab profile={profile} />}
        {activeTab === 'results' && <ResultsTab profile={profile} />}
        {activeTab === 'preseason' && <PreSeasonTab profile={profile} />}
        {activeTab === 'leaderboard' && <LeaderboardTab profile={profile} />}
        {activeTab === 'rules' && <RulesTab />}
        {activeTab === 'profile' && <ProfileTab profile={profile} session={session} />}
        {activeTab === 'admin' && profile.is_admin && <AdminPanel session={session} />}
      </div>
      <NavBar variant="bottom" tabs={tabs} active={activeTab} onChange={setActiveTab} />
    </div>
  );
}
