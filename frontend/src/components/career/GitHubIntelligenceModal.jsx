import React, { useState } from 'react'
import { analyzeGitHubProfile } from '../../api/careerApi'

export default function GitHubIntelligenceModal({
  show,
  onClose,
  onImportRepoToMaster,
  onImportSkillsToMaster,
}) {
  const [githubInput, setGithubInput] = useState('')
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [intel, setIntel] = useState(null)

  if (!show) return null

  const handleAnalyze = async () => {
    if (!githubInput.trim()) return
    setLoading(true)
    setError(null)
    setIntel(null)
    try {
      const res = await analyzeGitHubProfile(githubInput, token || null)
      setIntel(res)
    } catch (err) {
      setError(err.message || 'GitHub intelligence analysis failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '20px',
      }}
    >
      <div
        style={{
          background: 'var(--bg-card, #ffffff)',
          border: '1px solid var(--border, #e2e8f0)',
          borderRadius: '16px',
          maxWidth: '780px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border, #e2e8f0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-card-soft, #f8fafc)',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-primary, #0f172a)' }}>
              🐙 GitHub Profile Intelligence & Project Evidence
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
              Verifies repository ownership, tech stacks, test coverage, and CI/CD pipelines via official GitHub APIs.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: '18px', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {/* Input Bar */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <input
              type="text"
              value={githubInput}
              onChange={(e) => setGithubInput(e.target.value)}
              placeholder="Enter GitHub username or profile URL (e.g. torvalds or https://github.com/octocat)"
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '13px',
              }}
            />
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={loading || !githubInput.trim()}
              style={{
                background: 'var(--primary, #2563eb)',
                color: '#fff',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '8px',
                fontWeight: '700',
                fontSize: '13px',
                cursor: loading ? 'wait' : 'pointer',
              }}
            >
              {loading ? '⏳ Analyzing...' : 'Analyze Evidence'}
            </button>
          </div>

          <details style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            <summary style={{ cursor: 'pointer', fontWeight: '600' }}>🔑 Optional GitHub Token (for rate limits or private repos)</summary>
            <div style={{ marginTop: '8px' }}>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_... personal access token (optional, never saved permanently)"
                style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px' }}
              />
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                Only read:public_repo permission is needed. All external text is strictly sanitized against prompt-injection.
              </p>
            </div>
          </details>

          {error && (
            <div style={{ marginTop: '12px', background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: '8px', fontSize: '12px' }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Results Area */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {!intel && !loading && (
            <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
              <p style={{ margin: 0, fontSize: '13px' }}>
                Enter your GitHub handle above to audit repository codebases, detect frameworks, verify automated tests, and import factual evidence into your master profile.
              </p>
            </div>
          )}

          {intel && (
            <div>
              {/* Summary Card */}
              <div style={{ background: 'var(--bg-card-soft)', padding: '14px', borderRadius: '10px', marginBottom: '16px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: '800', fontSize: '14px' }}>@{intel.username}</span>
                  <a href={intel.profile_url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: 'var(--primary)' }}>
                    View Profile ↗
                  </a>
                </div>
                <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--text-muted)' }}>{intel.evidence_summary}</p>

                {intel.detected_skills?.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Verified Technologies Found in Repos:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                      {intel.detected_skills.map((s, idx) => (
                        <span key={idx} style={{ background: 'var(--bg-card)', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', border: '1px solid var(--border)' }}>
                          {s}
                        </span>
                      ))}
                    </div>
                    {onImportSkillsToMaster && (
                      <button
                        type="button"
                        onClick={() => onImportSkillsToMaster(intel.detected_skills)}
                        style={{
                          background: 'var(--primary)',
                          color: '#fff',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '600',
                          cursor: 'pointer',
                        }}
                      >
                        + Add Verified Skills to Master Profile
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Repositories List */}
              <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '800' }}>Analyzed Repositories ({intel.analyzed_repos?.length || 0})</h4>
              {(intel.analyzed_repos || []).map((repo, idx) => (
                <div
                  key={idx}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    padding: '14px',
                    marginBottom: '12px',
                    background: 'var(--bg-card)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ fontSize: '14px' }}>{repo.repo_name}</strong>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: '700',
                          padding: '2px 6px',
                          borderRadius: '10px',
                          background: repo.is_owned ? '#dcfce7' : '#f1f5f9',
                          color: repo.is_owned ? '#166534' : '#475569',
                        }}
                      >
                        {repo.is_owned ? '👑 Original Author' : '🍴 Fork'}
                      </span>
                      {repo.has_tests && (
                        <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '10px', background: '#e0f2fe', color: '#0369a1' }}>
                          ✓ Tests Verified
                        </span>
                      )}
                      {repo.has_ci_cd && (
                        <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '10px', background: '#fae8ff', color: '#86198f' }}>
                          ✓ CI/CD Pipeline
                        </span>
                      )}
                    </div>
                    <a href={repo.repo_url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: 'var(--primary)' }}>
                      GitHub ↗
                    </a>
                  </div>

                  <p style={{ margin: '4px 0 8px', fontSize: '12px', color: 'var(--text-muted)' }}>{repo.description}</p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                    {repo.detected_technologies.map((t, tidx) => (
                      <span key={tidx} style={{ background: 'var(--bg-card-soft)', fontSize: '11px', padding: '2px 6px', borderRadius: '4px' }}>
                        {t}
                      </span>
                    ))}
                  </div>

                  {onImportRepoToMaster && (
                    <button
                      type="button"
                      onClick={() => onImportRepoToMaster(repo)}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '600',
                        cursor: 'pointer',
                      }}
                    >
                      + Import as Master Profile Project
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', textAlign: 'right', background: 'var(--bg-card-soft)' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              padding: '6px 16px',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
