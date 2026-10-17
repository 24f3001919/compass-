import React, { useRef, useState } from 'react'
import { parseResumeFile } from '../../api/careerApi'

export default function ResumeImportModal({
  show,
  onClose,
  importText,
  setImportText,
  onImport,
  importing,
  importSuccess,
  onFileExtracted,
}) {
  const fileInputRef = useRef(null)
  const [fileError, setFileError] = useState(null)
  const [uploadingFile, setUploadingFile] = useState(false)

  if (!show) return null

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileError(null)
    setUploadingFile(true)
    try {
      const res = await parseResumeFile(file)
      if (res.success && res.extracted_content) {
        if (onFileExtracted) {
          onFileExtracted(res.extracted_content)
        }
      } else {
        setFileError(res.error_message || 'Failed to extract text from document.')
      }
    } catch (err) {
      setFileError(err.message || 'File upload failed.')
    } finally {
      setUploadingFile(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          maxWidth: '640px',
          width: '100%',
          padding: '24px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
            📥 Import Resume File or Paste Text
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--text-muted)' }}>
          Upload a resume file or paste raw text. Supported formats: <strong>PDF (.pdf)</strong>, <strong>Word (.docx)</strong>, <strong>Plain Text (.txt)</strong>, <strong>Markdown (.md)</strong>. Scanned images require OCR.
        </p>

        {/* File Upload Area */}
        <div
          style={{
            border: '2px dashed var(--border)',
            borderRadius: '10px',
            padding: '16px',
            textAlign: 'center',
            background: 'var(--bg-card-soft)',
            marginBottom: '16px',
          }}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".pdf,.docx,.txt,.md"
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingFile}
            style={{
              background: 'var(--primary)',
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: uploadingFile ? 'wait' : 'pointer',
              marginBottom: '6px',
            }}
          >
            {uploadingFile ? '⏳ Parsing Document...' : '📎 Choose Resume File (.pdf, .docx, .txt)'}
          </button>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Max size: 5 MB. Documents are parsed securely in-memory and never silently overwrite master data.
          </div>
        </div>

        {fileError && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '12px' }}>
            ⚠️ {fileError}
          </div>
        )}

        <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '6px' }}>
          Or paste raw resume text:
        </div>

        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={6}
          placeholder="Paste raw resume text here..."
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--bg-card-soft)',
            color: 'var(--text-primary)',
            boxSizing: 'border-box',
            fontSize: '13px',
            lineHeight: '1.4',
            marginBottom: '14px',
          }}
        />

        {importSuccess && (
          <div style={{ background: '#dcfce7', color: '#166534', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }}>
            ✓ Structured resume extracted successfully! Populating review fields...
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onImport}
            disabled={!importText.trim() || importing}
            style={{
              background: (!importText.trim() || importing) ? '#94a3b8' : 'var(--primary)',
              color: '#fff',
              border: 'none',
              padding: '8px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '700',
              cursor: (!importText.trim() || importing) ? 'not-allowed' : 'pointer',
            }}
          >
            {importing ? 'Extracting...' : 'Extract & Populate Review'}
          </button>
        </div>
      </div>
    </div>
  )
}
