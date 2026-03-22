import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('hybrid')
  const [answer, setAnswer] = useState(null)
  const [metadata, setMetadata] = useState([])
  const [graphData, setGraphData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  const [repos, setRepos] = useState([])
  const [activeRepo, setActiveRepo] = useState('default')
  const [cloneUrl, setCloneUrl] = useState('')
  const [cloning, setCloning] = useState(false)

  const fetchRepos = () => {
    fetch('http://localhost:8000/api/repos')
      .then(res => res.json())
      .then(data => {
        if (data.repos && data.repos.length > 0) {
          setRepos(data.repos);
          setActiveRepo(prev => prev === 'default' ? data.repos[0] : prev);
        }
      })
      .catch(err => console.error("Failed to fetch repos", err));
  };

  useEffect(() => {
    fetchRepos();
  }, []);

  const handleClone = async () => {
    if (!cloneUrl.trim()) return;
    setCloning(true);
    setError(null);
    
    try {
      const response = await fetch('http://localhost:8000/api/repos/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cloneUrl })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to clone repository');
      
      setCloneUrl('');
      fetchRepos();
      setActiveRepo(data.repo);
    } catch (err) {
      setError(err.message);
    } finally {
      setCloning(false);
    }
  };

  const parseMarkdown = (text) => {
    if (!text) return { __html: '' };
    
    // 1. Extract and protect code blocks
    const codeBlocks = [];
    let processedText = text.replace(/```([\s\S]*?)```/g, (match, code) => {
      const id = codeBlocks.length;
      const escapedCode = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      codeBlocks.push(`<pre><code>${escapedCode}</code></pre>`);
      return `__CODE_BLOCK_${id}__`;
    });
    
    // 2. Extract and protect inline code
    const inlineCodes = [];
    processedText = processedText.replace(/`([^`]+)`/g, (match, code) => {
      const id = inlineCodes.length;
      inlineCodes.push(`<code>${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code>`);
      return `__INLINE_CODE_${id}__`;
    });

    // 3. Apply standard markdown typography safely
    let html = processedText
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      .replace(/^- (.*$)/gim, '<ul><li>$1</li></ul>')
      .replace(/<\/ul>\n<ul>/gim, '')
      .replace(/\n\n/gim, '<p></p>')
      .replace(/\n/gim, '<br/>');

    // 4. Restore code blocks perfectly without header interference
    inlineCodes.forEach((codeHTML, i) => {
      html = html.replace(`__INLINE_CODE_${i}__`, codeHTML);
    });
    codeBlocks.forEach((codeHTML, i) => {
      html = html.replace(`__CODE_BLOCK_${i}__`, codeHTML);
    });

    return { __html: html };
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setLoading(true);
    setError(null);
    setAnswer(null);
    setMetadata([]);
    setGraphData(null);
    
    try {
      const response = await fetch('http://localhost:8000/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, mode, repo: activeRepo })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || 'Failed to fetch answer');
      }
      
      setAnswer(data.answer);
      setMetadata(data.metadata || []);
      setGraphData(data.graph_data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1 className="title">Cognitive Code RAG</h1>
        <p className="subtitle">Agentic Structural & Semantic Space Exploration</p>
      </header>

      <form className="search-box" onSubmit={handleSearch}>
        <div className="controls">
          <div className="mode-selector">
            <button type="button" className={`mode-btn ${mode === 'vector' ? 'active' : ''}`} onClick={() => setMode('vector')}>Semantic</button>
            <button type="button" className={`mode-btn ${mode === 'graph' ? 'active' : ''}`} onClick={() => setMode('graph')}>Structural</button>
            <button type="button" className={`mode-btn ${mode === 'hybrid' ? 'active' : ''}`} onClick={() => setMode('hybrid')}>Hybrid Fusion</button>
          </div>
          
          <select 
              className="repo-select" 
              value={activeRepo} 
              onChange={(e) => setActiveRepo(e.target.value)}
              title="Select Indexed Repository"
            >
              {repos.length === 0 && <option value="default">Default Repo</option>}
              {repos.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
          </select>
        </div>

        <div className="input-wrapper">
          <input 
            type="text" 
            className="query-input" 
            placeholder="Ask about codebase architecture, impacts, or dependencies..." 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={loading}
          />
          <button type="submit" className="submit-btn" disabled={loading || !query.trim()}>
            {loading ? <div className="spinner"></div> : 'Analyze'}
          </button>
        </div>

        <div className="clone-box">
          <input 
            type="text" 
            className="clone-input" 
            placeholder="Paste GitHub URL..."
            value={cloneUrl}
            onChange={(e) => setCloneUrl(e.target.value)}
            disabled={cloning || loading}
          />
          <button type="button" className="clone-btn" onClick={handleClone} disabled={cloning || loading || !cloneUrl.trim()}>
            {cloning ? <div className="spinner" style={{width: '14px', height: '14px'}}></div> : '+ Index Repo'}
          </button>
        </div>
      </form>

      {cloning && (
        <div className="loader-container">
          <div className="big-spinner"></div>
          <div className="loader-text">Cloning & Building AST Vector Indexes... (This takes a moment)</div>
        </div>
      )}

      {loading && !cloning && (
        <div className="loader-container">
          <div className="big-spinner"></div>
          <div className="loader-text">Navigating Codebase Trajectories...</div>
        </div>
      )}

      {error && (
        <div className="answer-card" style={{ padding: '1.5rem', borderColor: 'rgba(239, 68, 68, 0.4)' }}>
          <div style={{ color: '#ef4444', fontWeight: 600, fontSize: '1.1rem' }}>Connection Error</div>
          <p style={{ marginTop: '0.5rem', color: '#f8fafc' }}>{error}</p>
        </div>
      )}

      {answer && !loading && (
        <div className="answer-card">
          <div className="answer-header">
            <span className="engine-badge">✓ {mode.toUpperCase()} ENGINE</span>
            <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Query Processed Successfully</span>
          </div>
          
          <div className="markdown-body" dangerouslySetInnerHTML={parseMarkdown(answer)}></div>
          
          {(metadata.length > 0 || graphData) && (
            <div className="sources-container">
              <h3 className="sources-title">Context Sources Fused</h3>
              
              {metadata.length > 0 && (
                <div className="metadata-row">
                  <span className="source-label">Semantic Matches:</span>
                  <div className="pill-group">
                    {metadata.map((m, idx) => (
                      <span key={idx} className="badge-pill">
                        {m.file.split(/[\\/]/).pop()} (L:{m.line})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {graphData && !graphData.includes("No structural graph data") && (
                <div className="metadata-row">
                  <span className="source-label" style={{color: 'var(--success)'}}>Structural Topology Maps Parsed Successfully</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App
