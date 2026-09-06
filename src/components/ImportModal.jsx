import { useState, useRef, useCallback } from 'react';
import Modal from './Modal';
import Icon from './Icon';
import {
  ENTITY_COLUMNS, buildRows, parseTextRows, validateRow, applyDefaults,
} from '../utils/importUtils';

/**
 * ImportModal - reusable bulk-import modal for students/teachers/subjects/classes.
 *
 * Props:
 *   type           — 'student' | 'teacher' | 'subject' | 'class'
 *   onImport       — async function(data) called for each valid row, should return the new entity id
 *   onBulkImport   — optional async function(preparedRows) for bulk import (returns { students, errors })
 *   onCreateAccount — optional async function({ fullName, email, role, className, linkedStudentId })
 *                     called after each student import to create a login account with credentials
 *   onDone         — called after import completes
 *   onClose        — close handler
 */
export default function ImportModal({ type, onImport, onBulkImport, onCreateAccount, onDone, onClose }) {
  const [tab, setTab] = useState('excel');
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState({});
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [hasHeader, setHasHeader] = useState(true);
  const [ocrText, setOcrText] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [importComplete, setImportComplete] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const excelInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const def = ENTITY_COLUMNS[type];

  // ── Validation helper ──
  const applyValidation = (parsedRows) => {
    const errs = {};
    parsedRows.forEach((row, i) => {
      const missing = validateRow(type, row);
      if (missing.length > 0) errs[i] = missing;
    });
    setErrors(errs);
  };

  // ── Excel file handling ──
  const handleExcelFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const XLSX = await import('xlsx');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const parsed = buildRows(type, data, hasHeader);
    applyValidation(parsed);
    setRows(parsed);
    e.target.value = '';
  }, [type, hasHeader]);

  // ── Image OCR handling ──
  const handleImageFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    try {
      const Tesseract = await import('tesseract.js');
      const result = await Tesseract.recognize(file, 'eng', { logger: () => {} });
      const text = result.data.text || '';
      setOcrText(text);
      const parsed = parseTextRows(type, text);
      applyValidation(parsed.rows);
      setRows(parsed.rows);
      setHasHeader(parsed.hasHeader);
    } catch (err) {
      console.error('OCR failed:', err);
      alert('OCR processing failed. Please try again or paste text manually.');
    } finally {
      setOcrLoading(false);
      e.target.value = '';
    }
  }, [type]);

  // ── Re-parse when OCR text is edited ──
  const reparseOcrText = useCallback(() => {
    if (!ocrText.trim()) { setRows([]); return; }
    const parsed = parseTextRows(type, ocrText);
    applyValidation(parsed.rows);
    setRows(parsed.rows);
  }, [type, ocrText]);

  const removeRow = (idx) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
    setErrors(prev => {
      const next = {};
      for (const [k, v] of Object.entries(prev)) {
        const key = Number(k);
        if (key < idx) next[key] = v;
        else if (key > idx) next[key - 1] = v;
      }
      return next;
    });
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    let success = 0, failed = 0;
    const errorMessages = [];
    const accountsCreated = [];
    setProgress({ done: 0, total: rows.length });

    // ── Fast path: bulk import via server transaction ──
    if (onBulkImport) {
      try {
        const prepared = rows.map((row, i) => applyDefaults(type, row, i));
        const result = await onBulkImport(prepared);
        if (result && Array.isArray(result.students)) {
          success = result.students.length;
          failed = result.failed || 0;
          // Collect per-row errors from bulk result
          if (result.errors) {
            result.errors.forEach(e => {
              errorMessages.push(`${e.name || 'Row ' + (e.index + 1)}: ${e.error}`);
            });
          }
          // Create accounts for successfully imported students (even when no email
          // was provided — the server generates a username@ncba.edu.pk fallback)
          if (type === 'student' && onCreateAccount) {
            for (const student of result.students) {
              try {
                const acctResult = await onCreateAccount({
                  fullName: student.name,
                  email: student.email,
                  role: 'student',
                  className: student.className,
                  linkedStudentId: student.id
                });
                if (acctResult && acctResult.account) {
                  accountsCreated.push({
                    name: student.name,
                    username: acctResult.account.username,
                    email: acctResult.account.email,
                    password: acctResult.account.password || '(existing account)',
                  });
                } else if (acctResult && acctResult.success === false) {
                  errorMessages.push(`${student.name}: Account creation failed — ${acctResult.message || 'unknown error'}`);
                }
              } catch (acctErr) {
                console.error(`Account creation failed for ${student.name}:`, acctErr);
                errorMessages.push(`${student.name}: Account creation failed — ${acctErr.message || 'unknown error'}`);
              }
              setProgress({ done: Math.min(success + accountsCreated.length, rows.length), total: rows.length });
            }
          }
        } else {
          // Fallback: treat entire result as error
          failed = rows.length;
          errorMessages.push(result?.error || 'Bulk import failed');
        }
      } catch (err) {
        console.error('Bulk import failed:', err);
        failed = rows.length;
        errorMessages.push(err.message || 'Bulk import failed');
      }
      setImporting(false);
      setImportComplete(true);
      setImportResult({ success, failed, errors: errorMessages, accounts: accountsCreated });
      return;
    }

    // ── Fallback: one-by-one import ──
    for (let i = 0; i < rows.length; i++) {
      try {
        const data = applyDefaults(type, rows[i], i);
        const entityId = await onImport(data);
        // If importing students and onCreateAccount is provided, create a user login account
        if (type === 'student' && onCreateAccount && data.email) {
          try {
            const acctResult = await onCreateAccount({
              fullName: data.name,
              email: data.email,
              role: 'student',
              className: data.className,
              linkedStudentId: entityId
            });
            if (acctResult && acctResult.success === false) {
              errorMessages.push(`${data.name}: Account creation failed — ${acctResult.message || 'unknown error'}`);
            } else if (acctResult && acctResult.account) {
              accountsCreated.push({
                name: data.name,
                username: acctResult.account.username,
                email: acctResult.account.email,
                password: acctResult.account.password || '(existing account)',
              });
            }
          } catch (acctErr) {
            console.error(`Account creation failed for ${data.name}:`, acctErr);
            errorMessages.push(`${data.name}: Account creation failed — ${acctErr.message || 'unknown error'}`);
          }
        }
        success++;
      } catch (err) {
        console.error(`Import row ${i} failed:`, err);
        failed++;
        const rowName = rows[i]?.name || `Row ${i + 1}`;
        errorMessages.push(`${rowName}: ${err.message || 'Import failed'}`);
      }
      setProgress({ done: i + 1, total: rows.length });
    }
    setImporting(false);
    setImportComplete(true);
    setImportResult({ success, failed, errors: errorMessages, accounts: accountsCreated });
  };

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const headers = def.columns.map(c => c.key);
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, def.label);
    XLSX.writeFile(wb, `${type}_import_template.xlsx`);
  };

  // ── Completion screen ──
  if (importComplete) {
    const accounts = importResult.accounts || [];
    const hasAccounts = type === 'student' && accounts.length > 0;
    return (
      <Modal title={`Import ${def.label}s`} onClose={() => { onDone(); onClose(); }}>
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
            background: importResult.failed === 0 ? 'var(--success-bg)' : 'var(--primary-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="check" size={32} style={{ color: 'var(--success)' }} />
          </div>
          <h3 style={{ margin: '0 0 8px' }}>Import Complete</h3>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            <strong>{importResult.success}</strong> {def.label.toLowerCase()}s added
            {importResult.failed > 0 && (
              <> &middot; <strong style={{ color: 'var(--danger)' }}>{importResult.failed}</strong> failed</>
            )}
            {hasAccounts && (
              <> &middot; <strong style={{ color: 'var(--primary)' }}>{accounts.length}</strong> login accounts created</>
            )}
          </p>

          {/* Errors */}
          {importResult.errors && importResult.errors.length > 0 && (
            <div style={{
              marginTop: 16, maxHeight: 160, overflowY: 'auto', textAlign: 'left',
              background: 'var(--card-bg, #f9f9f9)', border: '1px solid var(--border, #e0e0e0)',
              borderRadius: 8, padding: '10px 14px', fontSize: '0.82rem',
            }}>
              {importResult.errors.map((msg, i) => (
                <div key={i} style={{ color: 'var(--danger, #dc2626)', padding: '3px 0', borderBottom: i < importResult.errors.length - 1 ? '1px solid var(--border, #eee)' : 'none' }}>
                  {msg}
                </div>
              ))}
            </div>
          )}

          {/* Created accounts credentials table */}
          {hasAccounts && (
            <div style={{
              marginTop: 16, maxHeight: 240, overflowY: 'auto', textAlign: 'left',
              background: 'var(--card-bg, #f9f9f9)', border: '1px solid var(--border, #e0e0e0)',
              borderRadius: 8, padding: '10px 14px', fontSize: '0.82rem',
            }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Login Credentials
              </div>
              {accounts.length > 1 && (
                <div style={{ marginBottom: 8 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      try {
                        const text = accounts.map(a => `Username: ${a.username}\nPassword: ${a.password}\n`).join('\n');
                        navigator.clipboard.writeText(text);
                        alert('All credentials copied to clipboard! You can paste them into a spreadsheet or notepad.');
                      } catch {
                        alert('Could not copy automatically. Please note the credentials manually.');
                      }
                    }}
                  >
                    📋 Copy All Credentials
                  </button>
                </div>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border, #e0e0e0)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>Username</th>
                    <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>Password</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acct, i) => (
                    <tr key={i} style={{ borderBottom: i < accounts.length - 1 ? '1px solid var(--border, #eee)' : 'none' }}>
                      <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>{acct.name}</td>
                      <td style={{ padding: '4px 6px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{acct.username}</td>
                      <td style={{ padding: '4px 6px', fontFamily: 'monospace', whiteSpace: 'nowrap', color: 'var(--primary)', fontWeight: 500 }}>{acct.password}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button className="btn btn-primary" style={{ marginTop: 20 }}
            onClick={() => { onDone(); onClose(); }}>Done</button>
        </div>
      </Modal>
    );
  }

  // ── Main JSX ──
  return (
    <Modal
      title={`Import ${def.label}s`}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={rows.length === 0 || importing || Object.keys(errors).length > 0}
            onClick={handleImport}
          >
            {importing
              ? `Importing ${progress.done + 1}/${progress.total}...`
              : `Import ${rows.length} ${def.label.toLowerCase()}${rows.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      }
    >
      {/* Tab bar */}
      <div className="import-tabs">
        <button className={`import-tab ${tab === 'excel' ? 'active' : ''}`}
          onClick={() => setTab('excel')}>
          <Icon name="flag" size={14} /> Excel / CSV
        </button>
        <button className={`import-tab ${tab === 'image' ? 'active' : ''}`}
          onClick={() => setTab('image')}>
          <Icon name="view" size={14} /> Image (OCR)
        </button>
        <button className="import-tab" onClick={downloadTemplate}
          style={{ marginLeft: 'auto', color: 'var(--primary)', background: 'transparent' }}>
          Download Template
        </button>
      </div>

      {/* Excel tab */}
      {tab === 'excel' && (
        <div className="import-dropzone">
          <input ref={excelInputRef} type="file" accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }} onChange={handleExcelFile} />
          <label style={{ cursor: 'pointer' }} onClick={() => excelInputRef.current?.click()}>
            <div className="import-dropzone-content">
              <Icon name="flag" size={36} style={{ color: 'var(--primary)', opacity: 0.6 }} />
              <p style={{ margin: '8px 0 4px', fontWeight: 600 }}>Click to upload Excel or CSV file</p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Supports .xlsx, .xls, .csv
              </p>
            </div>
          </label>
          <label className="import-header-toggle">
            <input type="checkbox" checked={hasHeader}
              onChange={e => setHasHeader(e.target.checked)} />
            <span>First row is header</span>
          </label>
        </div>
      )}

      {/* Image / OCR tab */}
      {tab === 'image' && (
        <div className="import-dropzone">
          <input ref={imageInputRef} type="file" accept="image/*"
            style={{ display: 'none' }} onChange={handleImageFile} />
          <label style={{ cursor: 'pointer' }} onClick={() => imageInputRef.current?.click()}>
            <div className="import-dropzone-content">
              {ocrLoading ? (
                <div className="import-spinner" />
              ) : (
                <Icon name="view" size={36} style={{ color: 'var(--primary)', opacity: 0.6 }} />
              )}
              <p style={{ margin: '8px 0 4px', fontWeight: 600 }}>
                {ocrLoading ? 'Extracting text from image...' : 'Click to upload image'}
              </p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {ocrLoading ? 'This may take a moment' : 'OCR will extract tabular data automatically'}
              </p>
            </div>
          </label>
          {ocrText && (
            <textarea className="import-ocr-text" rows={6} value={ocrText}
              onChange={e => setOcrText(e.target.value)}
              placeholder="Extracted text will appear here. You can edit it before importing."
              style={{ marginTop: 12 }} />
          )}
          {ocrText && (
            <button className="btn btn-sm btn-secondary" style={{ marginTop: 8 }}
              onClick={reparseOcrText}>Re-parse text</button>
          )}
        </div>
      )}

      {/* Preview */}
      {rows.length > 0 && (
        <div className="import-preview">
          <div className="import-preview-header">
            <span>
              <strong>{rows.length}</strong> rows parsed
              {Object.keys(errors).length > 0 && (
                <span className="import-error-count">
                  {' '}&middot; {Object.keys(errors).length} with issues
                </span>
              )}
            </span>
          </div>
          <div className="import-preview-table-wrap">
            <table className="import-preview-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  {def.columns.map(c => <th key={c.key}>{c.key}</th>)}
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const rowErrors = errors[i];
                  return (
                    <tr key={i} className={rowErrors ? 'import-row-error' : ''}>
                      <td className="import-row-num">{i + 1}</td>
                      {def.columns.map(c => (
                        <td key={c.key}
                          className={rowErrors?.includes(c.key) ? 'import-cell-error' : ''}
                          title={rowErrors?.includes(c.key) ? 'Required field missing' : row[c.key]}>
                          {row[c.key] || <span className="import-cell-empty">-</span>}
                        </td>
                      ))}
                      <td>
                        <button className="import-row-remove" onClick={() => removeRow(i)}
                          title="Remove row">
                          <Icon name="delete" size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rows.length === 0 && !ocrLoading && (
        <div className="import-empty-hint">
          Upload a file or image to preview rows before importing.
        </div>
      )}
    </Modal>
  );
}
