import React, { useState } from 'react'

const ROLE_OPTIONS = [
  'Artificial Intelligence and Machine Learning',
  'Generative AI and LLM Engineering',
  'Software Engineering',
  'Backend Engineering',
  'Data Science & Analytics',
  'Research Internships',
  'Cloud and Infrastructure Engineering',
  'Open Source Programs',
]

export default function RadarProfileModal({
  profile,
  onClose,
  onSave,
  isSaving,
}) {
  const [degree, setDegree] = useState(profile?.degree || 'B.Tech')
  const [specialization, setSpecialization] = useState(profile?.degree_specialization || 'Computer Science & Engineering')
  const [university, setUniversity] = useState(profile?.university || '')
  const [academicYear, setAcademicYear] = useState(profile?.academic_year || 2)
  const [gradYear, setGradYear] = useState(profile?.grad_year || 2027)
  const [gradMonth, setGradMonth] = useState(profile?.grad_month || 6)
  const [countryOfStudy, setCountryOfStudy] = useState(profile?.country_of_study || 'India')
  const [preferredArrangements, setPreferredArrangements] = useState(
    profile?.preferred_work_arrangements || ['remote', 'hybrid', 'onsite']
  )
  const [preferredRoles, setPreferredRoles] = useState(profile?.preferred_roles || [ROLE_OPTIONS[0], ROLE_OPTIONS[2]])
  const [skillsStr, setSkillsStr] = useState((profile?.skills || ['Python', 'PyTorch', 'Data Structures', 'C++']).join(', '))
  const [saveSuccess, setSaveSuccess] = useState(false)

  const toggleArrangement = arr => {
    setPreferredArrangements(prev =>
      prev.includes(arr) ? prev.filter(x => x !== arr) : [...prev, arr]
    )
  }

  const toggleRole = role => {
    setPreferredRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    )
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setSaveSuccess(false)
    const skillsList = skillsStr
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    await onSave({
      degree,
      degree_specialization: specialization,
      university,
      academic_year: Number(academicYear),
      grad_year: Number(gradYear),
      grad_month: Number(gradMonth),
      country_of_study: countryOfStudy,
      country_of_residence: countryOfStudy,
      preferred_work_arrangements: preferredArrangements,
      preferred_roles: preferredRoles,
      skills: skillsList,
    })
    setSaveSuccess(true)
    setTimeout(() => {
      setSaveSuccess(false)
      onClose()
    }, 1200)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        zIndex: 999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '640px',
          maxHeight: '90vh',
          background: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Academic Eligibility & Matching Profile
            </h2>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Used strictly for deterministic eligibility calculation and customized recommendation ranking.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '22px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Degree & Specialization */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Current Degree
              </label>
              <input
                type="text"
                value={degree}
                onChange={e => setDegree(e.target.value)}
                placeholder="e.g. B.Tech, B.E., BS"
                required
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-app)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Specialization / Major
              </label>
              <input
                type="text"
                value={specialization}
                onChange={e => setSpecialization(e.target.value)}
                placeholder="e.g. Computer Science, AI"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-app)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Academic Year & Graduation Cohort */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Academic Year
              </label>
              <select
                value={academicYear}
                onChange={e => setAcademicYear(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-app)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              >
                <option value={1}>1st Year (Freshman)</option>
                <option value={2}>2nd Year (Sophomore)</option>
                <option value={3}>3rd Year (Junior)</option>
                <option value={4}>4th Year (Senior)</option>
                <option value={5}>5th Year (Dual Degree)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Graduation Year
              </label>
              <input
                type="number"
                min={2025}
                max={2032}
                value={gradYear}
                onChange={e => setGradYear(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-app)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Country of Study
              </label>
              <input
                type="text"
                value={countryOfStudy}
                onChange={e => setCountryOfStudy(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-app)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Technical Skills */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Technical Skills (comma-separated)
            </label>
            <input
              type="text"
              value={skillsStr}
              onChange={e => setSkillsStr(e.target.value)}
              placeholder="e.g. Python, PyTorch, C++, CUDA, React, Go, Docker"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-app)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Used to match skill requirements and calculate relevance scores.
            </div>
          </div>

          {/* Work Arrangement Preferences */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Preferred Work Arrangements
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {['remote', 'hybrid', 'onsite'].map(arr => {
                const checked = preferredArrangements.includes(arr)
                return (
                  <button
                    key={arr}
                    type="button"
                    onClick={() => toggleArrangement(arr)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      border: checked ? '1px solid var(--brand)' : '1px solid var(--border)',
                      background: checked ? 'rgba(245, 166, 35, 0.15)' : 'var(--bg-app)',
                      color: checked ? 'var(--brand)' : 'var(--text-secondary)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    {arr}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Preferred Role Tracks */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Target Opportunity Tracks
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {ROLE_OPTIONS.map(role => {
                const selected = preferredRoles.includes(role)
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggleRole(role)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '8px',
                      border: selected ? '1px solid var(--brand)' : '1px solid var(--border)',
                      background: selected ? 'rgba(245, 166, 35, 0.12)' : 'var(--bg-app)',
                      color: selected ? 'var(--brand-dark)' : 'var(--text-secondary)',
                      fontSize: '11px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    {selected ? '✓ ' : '+ '}
                    {role}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Footer Submit */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
            {saveSuccess && (
              <span style={{ fontSize: '13px', color: '#10b981', fontWeight: 600 }}>
                ✓ Profile saved! Updating eligibility criteria…
              </span>
            )}
            <button
              type="submit"
              disabled={isSaving}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                background: 'var(--brand)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
                fontSize: '13px',
                cursor: isSaving ? 'not-allowed' : 'pointer',
              }}
            >
              {isSaving ? 'Saving Profile…' : 'Save Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
