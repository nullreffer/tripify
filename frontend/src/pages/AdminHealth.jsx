import React, { useEffect, useState, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

function formatUptime(startedAt) {
  const ms = Date.now() - new Date(startedAt).getTime();
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function statusColor(code) {
  if (code.startsWith('2')) return { background: '#dcfce7', color: '#15803d' };
  if (code.startsWith('3')) return { background: '#fef9c3', color: '#854d0e' };
  if (code.startsWith('4')) return { background: '#fee2e2', color: '#b91c1c' };
  if (code.startsWith('5')) return { background: '#fce7f3', color: '#9d174d' };
  return { background: 'var(--border)', color: 'var(--text)' };
}

// Outgoing call success-rate threshold below which the value is coloured red.
const SUCCESS_RATE_THRESHOLD = 90; // percent

export default function AdminHealth() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/health`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load health data');
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="trips-status trips-error">{error}</div>;
  if (!data) return <div className="trips-status"><div className="spinner" /></div>;

  const statusEntries = Object.entries(data.requests.byStatus)
    .sort(([a], [b]) => a.localeCompare(b));
  const successCount = statusEntries
    .filter(([k]) => k.startsWith('2'))
    .reduce((s, [, v]) => s + v, 0);
  const clientErrCount = statusEntries
    .filter(([k]) => k.startsWith('4'))
    .reduce((s, [, v]) => s + v, 0);
  const serverErrCount = statusEntries
    .filter(([k]) => k.startsWith('5'))
    .reduce((s, [, v]) => s + v, 0);
  const outgoingEntries = Object.entries(data.outgoing);

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <div style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>
          {data.version && <><strong>v{data.version}</strong>&ensp;·&ensp;</>}
          Uptime: <strong>{formatUptime(data.startedAt)}</strong>
          &ensp;·&ensp;Stats reset on restart
        </div>
        <button
          className="btn-secondary"
          onClick={load}
          disabled={loading}
          style={{ fontSize: '.85rem', padding: '.3rem .8rem' }}
        >
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      {/* Summary cards */}
      <div className="admin-grid">
        {[
          ['Total Requests', data.requests.total.toLocaleString()],
          ['Successful (2xx)', successCount.toLocaleString()],
          ['Client Errors (4xx)', clientErrCount.toLocaleString()],
          ['Server Errors (5xx)', serverErrCount.toLocaleString()],
          ['Avg Latency', data.requests.avgLatencyMs != null ? `${data.requests.avgLatencyMs} ms` : '—'],
          ['P50 Latency', data.requests.p50LatencyMs != null ? `${data.requests.p50LatencyMs} ms` : '—'],
          ['P95 Latency', data.requests.p95LatencyMs != null ? `${data.requests.p95LatencyMs} ms` : '—'],
        ].map(([label, value]) => (
          <div key={label} className="admin-card">
            <div className="admin-card-label">{label}</div>
            <div className="admin-card-value" style={{ fontSize: '1.2rem' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Response code breakdown */}
      <h3 className="admin-section-title">Response Codes</h3>
      {statusEntries.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '.9rem' }}>No requests recorded yet.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Count</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {statusEntries.map(([code, count]) => (
                <tr key={code}>
                  <td>
                    <span className="admin-badge" style={statusColor(code)}>{code}</span>
                  </td>
                  <td>{count.toLocaleString()}</td>
                  <td>
                    {data.requests.total
                      ? `${((count / data.requests.total) * 100).toFixed(1)}%`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-path breakdown */}
      <h3 className="admin-section-title">Requests by Path</h3>
      {Object.keys(data.requests.byPath || {}).length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '.9rem' }}>No requests recorded yet.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Method &amp; Path</th>
                <th>Count</th>
                <th>Share</th>
                <th>Status Breakdown</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.requests.byPath).map(([path, info]) => (
                <tr key={path}>
                  <td style={{ fontFamily: 'monospace', fontSize: '.85rem' }}>{path}</td>
                  <td>{info.count.toLocaleString()}</td>
                  <td>
                    {data.requests.total
                      ? `${((info.count / data.requests.total) * 100).toFixed(1)}%`
                      : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {Object.entries(info.byStatus).sort(([a], [b]) => a.localeCompare(b)).map(([code, cnt]) => (
                        <span key={code} className="admin-badge" style={statusColor(code)}>
                          {code}: {cnt}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Service Configuration */}
      {data.services && (
        <>
          <h3 className="admin-section-title">Service Configuration</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>API Key</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['aqicn', 'AQICN (AQI tiles)'],
                  ['nasaFirms', 'NASA FIRMS (Active Fires)'],
                  ['tomtom', 'TomTom'],
                  ['here', 'HERE'],
                  ['googlePlaces', 'Google Places'],
                  ['gemini', 'Gemini AI'],
                ].map(([key, label]) => {
                  const svc = data.services[key];
                  if (!svc) return null;
                  return (
                    <tr key={key}>
                      <td style={{ fontWeight: 600 }}>{label}</td>
                      <td>
                        <span className="admin-badge" style={svc.configured
                          ? { background: '#dcfce7', color: '#15803d' }
                          : { background: '#fee2e2', color: '#b91c1c' }}>
                          {svc.configured ? 'Configured' : 'Not configured'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Outgoing API calls */}
      <h3 className="admin-section-title">Outgoing API Calls</h3>
      {outgoingEntries.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '.9rem' }}>No outgoing calls recorded yet.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Total</th>
                <th>Success</th>
                <th>Failure</th>
                <th>Success Rate</th>
                <th>Avg Latency</th>
              </tr>
            </thead>
            <tbody>
              {outgoingEntries.map(([svc, stats]) => {
                const rate = stats.count
                  ? ((stats.success / stats.count) * 100).toFixed(1)
                  : null;
                return (
                  <tr key={svc}>
                    <td style={{ fontWeight: 600 }}>{svc}</td>
                    <td>{stats.count.toLocaleString()}</td>
                    <td style={{ color: '#16a34a' }}>{stats.success.toLocaleString()}</td>
                    <td style={{ color: stats.failure ? '#dc2626' : undefined }}>
                      {stats.failure.toLocaleString()}
                    </td>
                    <td>
                      {rate != null ? (
                        <span style={{ color: parseFloat(rate) < SUCCESS_RATE_THRESHOLD ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                          {rate}%
                        </span>
                      ) : '—'}
                    </td>
                    <td>{stats.avgMs != null ? `${stats.avgMs} ms` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
