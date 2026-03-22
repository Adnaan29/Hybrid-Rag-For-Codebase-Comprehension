import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Search, Network, Database, Activity, Code, GitMerge, X, 
  Zap, ChevronRight, CheckCircle2, ArrowLeft, Layers, Maximize,
  Info, Cpu, ExternalLink, RefreshCw, ZoomIn, ZoomOut, Filter,
  Layout, Braces, FileText
} from 'lucide-react';
import './App.css';

/**
 * UTILS: Color & Graph Formatting
 */
const COLORS = {
  function: '#4ade80',  // Green
  class: '#f472b6',     // Pink
  file: '#9ca3af',      // Gray
  link: 'rgba(255, 255, 255, 0.15)',
  activeLink: 'rgba(74, 222, 128, 0.5)'
};

/**
 * COMPONENT: GRAPH_EXPLORER (Independent Mode)
 * Used as a standalone page when ?graph=... is present
 */
function GraphExplorer({ initialRepo, initialType }) {
  const [repo, setRepo] = useState(initialRepo);
  const [type, setType] = useState(initialType); // 'query' or 'repo'
  const [data, setData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [inspectedNode, setInspectedNode] = useState(null);
  const graphRef = useRef(null);
  
  // Responsive dimensions
  const [dim, setDim] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const handle = () => setDim({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);

  // Fetch Logic for the whole repo or query cached data
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      if (type === 'query') {
        const cached = localStorage.getItem('AXON_QUERY_GRAPH');
        if (cached) {
          try {
            setData(JSON.parse(cached));
          } catch(e) { console.error("Parse fail", e); }
        }
      } else {
        try {
          const res = await fetch(`http://localhost:8000/api/repos/${repo}/graph`);
          const d = await res.json();
          if (d.nodes && d.links) setData(d);
        } catch(e) { console.error("Fetch fail", e); }
      }
      setLoading(false);
    };
    load();
  }, [repo, type]);

  // Simulation tuning
  useEffect(() => {
    const graph = graphRef.current;
    if (graph && graph.d3Force) {
      try {
        graph.d3Force('charge')?.strength(-800);
        graph.d3Force('link')?.distance(type === 'repo' ? 120 : 150);
        
        if (typeof graph.d3AlphaTarget === 'function') {
          graph.d3AlphaTarget(0.05);
          setTimeout(() => {
            if (graph && typeof graph.d3AlphaTarget === 'function') {
              graph.d3AlphaTarget(0);
            }
          }, 3000);
        }
      } catch (e) {
        console.warn("Simulation tuning failed", e);
      }
    }
  }, [data, type]);

  const paintNode = useCallback((node, ctx, globalScale) => {
    try {
      const label = node.label || node.id || '?';
      const fontSize = Math.min(Math.max(14 / globalScale, 12 / globalScale), 30);
      ctx.font = `600 ${fontSize}px 'Inter', sans-serif`;
      
      const radius = 6;
      const textWidth = ctx.measureText(label).width;
      const padding = 2;
      const labelW = textWidth + padding * 2;
      const labelH = fontSize + padding * 2;
      const textYOffset = radius + fontSize * 1.5;
      
      // Node Circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = COLORS[node.type] || '#fff';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Permanent Label (Only if zoomed in enough)
      if (globalScale > 0.4) {
        ctx.fillStyle = 'rgba(10, 10, 12, 0.9)';
        ctx.beginPath();
        const rx = node.x - labelW/2;
        const ry = node.y + textYOffset - labelH/2;
        ctx.fillRect(rx, ry, labelW, labelH);
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f3f4f6';
        ctx.fillText(label, node.x, node.y + textYOffset);
      }
      node.__bckgDimensions = [labelW, labelH];
    } catch(e) {}
  }, []);

  return (
    <div className="graph-explorer-page" style={{background:'#0a0a0c', color:'#fff', width:'100vw', height:'100vh', overflow:'hidden', position:'relative'}}>
      {/* Absolute Headings/Controls */}
      <div className="graph-explorer-header">
         <div style={{display:'flex', alignItems:'center', gap:'1rem'}}>
           <div className="branding-icon" style={{background:'var(--primary-glow)', padding:'0.5rem'}}><Network size={22}/></div>
           <div style={{display:'flex', flexDirection:'column'}}>
             <h2 style={{margin:0, fontSize:'1.2rem', letterSpacing:'1px'}}>{repo.toUpperCase()} ARCHITECTURE</h2>
             <span style={{fontSize:'0.6rem', color:'var(--text-secondary)', textTransform:'uppercase'}}>Visualizing {type === 'repo' ? 'Entire Repository' : 'Targeted Query Path'}</span>
           </div>
         </div>

         <div className="graph-toggle">
            <button className={`toggle-opt ${type === 'query' ? 'active' : ''}`} onClick={() => setType('query')}>Targeted Logic Graph</button>
            <button className={`toggle-opt ${type === 'repo' ? 'active' : ''}`} onClick={() => setType('repo')}>Full Repo Topology</button>
         </div>

         <button className="back-btn" onClick={() => window.close()} style={{background:'var(--bg-panel)', border:'1px solid var(--border)', padding:'0.75rem 1rem', borderRadius:'8px', fontSize:'0.8rem'}}>
           <X size={16} /> Close Explorer
         </button>
      </div>

      {loading && (
        <div className="empty-state" style={{zIndex: 50, position:'absolute', top:0, left:0, width:'100%', height:'100%', background:'rgba(10,10,12,0.8)', backdropFilter:'blur(20px)'}}>
          <RefreshCw className="spinning" size={60} style={{color:'var(--primary)'}} />
          <h2>RECONSTRUCTING TOPOLOGY...</h2>
          <p>Navigating through AST relationships and symbol tables.</p>
        </div>
      )}

      {/* Legend & Meta */}
      <div className="legend-panel">
         <h3>NODE SCHEMA</h3>
         <div className="legend-item"><div className="color-dot" style={{background: COLORS.function}}/> FUNCTION / ENTITY</div>
         <div className="legend-item"><div className="color-dot" style={{background: COLORS.class}}/> OBJECT / STRUCTURE</div>
         <div className="legend-item"><div className="color-dot" style={{background: COLORS.file}}/> PHYSICAL SOURCE</div>
         <hr style={{margin:'0.75rem 0', borderColor:'var(--border)', borderStyle:'dashed'}}/>
         <div style={{fontSize:'0.7rem', color:'var(--text-secondary)'}}>TIP: SCROLL TO ZOOM / DRAG TO PAN</div>
         <div style={{fontSize:'0.7rem', color:'var(--text-secondary)'}}>CLICK NODE TO INSPECT PROPERTIES</div>
      </div>

      <ForceGraph2D
        ref={graphRef}
        width={dim.w}
        height={dim.h}
        graphData={data}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={(n, color, ctx) => {
          const dims = n.__bckgDimensions;
          if (!dims) return;
          const fs = Math.max(14 / (graphRef.current?.zoom() || 1), 1.5);
          ctx.fillStyle = color;
          ctx.fillRect(n.x - dims[0]/2, n.y + (6 + fs*1.5) - dims[1]/2, dims[0], dims[1]);
          ctx.beginPath(); ctx.arc(n.x, n.y, 6, 0, 2*Math.PI); ctx.fill();
        }}
        linkColor={() => COLORS.link}
        linkWidth={0.5}
        linkDirectionalParticles={type === 'query' ? 3 : 1}
        linkDirectionalParticleSpeed={0.005}
        onNodeClick={n => setInspectedNode(n)}
        backgroundColor="#0a0a0c"
      />

      <AnimatePresence>
        {inspectedNode && (
          <motion.div initial={{opacity:0, x:40}} animate={{opacity:1, x:0}} exit={{opacity:0, x:40}} className="node-inspector">
            <div className="inspector-header">
              <div>
                <h3 style={{fontSize:'1.3rem', marginBottom:'0.5rem'}}>{inspectedNode.label}</h3>
                <div className="type-badge" style={{color: COLORS[inspectedNode.type]}}>{inspectedNode.type.toUpperCase()} ELEMENT</div>
              </div>
              <button className="close-btn" onClick={() => setInspectedNode(null)}><X size={20}/></button>
            </div>
            
            <div className="inspector-content">
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1.5rem'}}>
                <div className="info-item" style={{textAlign:'center'}}>
                  <div style={{fontSize:'0.6rem', color:'var(--text-secondary)', marginBottom:'0.25rem'}}>IN-DEGS</div>
                  <div style={{fontSize:'1.2rem', fontWeight:'800', color:COLORS.function}}>{data.links.filter(l => (typeof l.target === 'object' ? l.target.id : l.target) === inspectedNode.id).length}</div>
                </div>
                <div className="info-item" style={{textAlign:'center'}}>
                  <div style={{fontSize:'0.6rem', color:'var(--text-secondary)', marginBottom:'0.25rem'}}>OUT-DEGS</div>
                  <div style={{fontSize:'1.2rem', fontWeight:'800', color:COLORS.class}}>{data.links.filter(l => (typeof l.source === 'object' ? l.source.id : l.source) === inspectedNode.id).length}</div>
                </div>
              </div>

              <div className="inspector-section">
                <h4>PHYSICAL LOCATION</h4>
                <div className="info-item">{inspectedNode.file || 'External Symbol'}</div>
              </div>
              <div className="inspector-section">
                <h4>INTERNAL IDENTIFIER</h4>
                <div className="info-item" style={{opacity:0.6, fontSize:'0.75rem', fontFamily:'monospace'}}>{inspectedNode.id}</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * MAIN COMPONENT: APP (Search Interface + Router)
 */
function App() {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  
  // ROUTING LOGIC: If a graph param is present, render the full Graph Explorer
  if (params.get('graph')) {
    return <GraphExplorer initialRepo={params.get('repo')} initialType={params.get('graph')} />;
  }

  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('hybrid');
  const [repos, setRepos] = useState([]);
  const [activeRepo, setActiveRepo] = useState('default');
  const [cloneUrl, setCloneUrl] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState(null);
  
  const [answer, setAnswer] = useState(null);
  const [pipelineData, setPipelineData] = useState(null);
  const [traceStep, setTraceStep] = useState(0);
  const [activeTab, setActiveTab] = useState('answer');
  
  useEffect(() => {
    fetch('http://localhost:8000/api/repos')
      .then(res => res.json())
      .then(d => {
        if (d.repos?.length > 0) {
          setRepos(d.repos);
          setActiveRepo(d.repos[0]);
        }
      });
  }, []);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    setLoading(true); setError(null); setAnswer(null); setPipelineData(null); setTraceStep(1);
    const traceInterval = setInterval(() => setTraceStep(p => p < 3 ? p + 1 : p), 2000);

    try {
      const res = await fetch('http://localhost:8000/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, mode, repo: activeRepo })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Fetch failed');
      
      clearInterval(traceInterval);
      setTraceStep(4);
      setAnswer(data.answer);
      setPipelineData(data.pipeline_data);
      if (data.pipeline_data?.graph_json) {
        // Cache graph for the explorer tab
        const nodes = data.pipeline_data.graph_json.nodes || [];
        const links = (data.pipeline_data.graph_json.edges || []).map(e => ({ source: e.source, target: e.target }));
        localStorage.setItem('AXON_QUERY_GRAPH', JSON.stringify({ nodes, links }));
      }
    } catch (err) {
      clearInterval(traceInterval); setTraceStep(0); setError(err.message);
    } finally { setLoading(false); }
  };

  const handleClone = async () => {
    if (!cloneUrl.trim()) return;
    setCloning(true); setError(null);
    try {
      const response = await fetch('http://localhost:8000/api/repos/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cloneUrl })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to clone repo');
      setCloneUrl('');
      // Trigger refresh of repos
      fetch('http://localhost:8000/api/repos')
        .then(res => res.json())
        .then(d => { if (d.repos?.length > 0) setRepos(d.repos); });
      setActiveRepo(data.repo);
    } catch (err) { setError(err.message); } finally { setCloning(false); }
  };

  const handleExplore = () => {
    window.open(`/?graph=query&repo=${activeRepo}`, '_blank');
  };

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="branding">
            <div className="branding-icon"><Zap size={22} /></div>
            <h1>AXON SEARCH</h1>
          </div>
          
          <form className="search-form" style={{marginTop: '1.5rem'}} onSubmit={handleSearch}>
            <div className="input-container">
              <Search className="search-icon" size={18} />
              <input 
                autoFocus 
                type="text" 
                className="search-input" 
                placeholder="Analyze codebase structure..." 
                value={query} 
                onChange={e => setQuery(e.target.value)} 
                disabled={loading}
              />
            </div>
            
            <div className="controls-row">
              <select className="select-box" value={activeRepo} onChange={e => setActiveRepo(e.target.value)}>
                {repos.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <select className="select-box" style={{flex:0.7}} value={mode} onChange={e => setMode(e.target.value)}>
                <option value="hybrid">Fusion</option>
                <option value="graph">Graph</option>
                <option value="vector">Semantic</option>
              </select>
            </div>
            
            <button type="submit" className="run-btn" disabled={loading || !query.trim()}>
              {loading ? <motion.div animate={{rotate:360}} transition={{repeat:Infinity, duration:1}}><RefreshCw size={18}/></motion.div> : 'START ANALYSIS'}
            </button>
          </form>

          <div style={{marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid var(--border)'}}>
            <div style={{fontSize:'0.65rem', textTransform:'uppercase', color:'var(--text-secondary)', marginBottom:'1rem', letterSpacing:'1px'}}>Index New Codebase</div>
            <div style={{display:'flex', gap:'0.65rem', position:'relative'}}>
               <input 
                 type="text" 
                 className="search-input" 
                 style={{padding:'0.8rem 1rem', fontSize:'0.85rem'}} 
                 placeholder="Git URL..." 
                 value={cloneUrl} 
                 onChange={e=>setCloneUrl(e.target.value)} 
               />
               <button 
                 className="run-btn" 
                 style={{padding:'0 1.25rem', background:'var(--bg-panel)', color:'var(--text-primary)', border:'1px solid var(--border)'}} 
                 onClick={handleClone} 
                 disabled={cloning}
               >
                 {cloning ? '...' : '+'}
               </button>
            </div>
            {cloning && <div style={{fontSize:'0.6rem', color:'var(--primary)', marginTop:'0.75rem', fontWeight:'700'}}>INDEXING PIPELINE ENGAGED...</div>}
          </div>
        </div>

        <div className="sidebar-content">
          {error && <div className="info-item" style={{borderColor:'#ef4444', color:'#ef4444'}}>CRITICAL_ERROR: {error}</div>}
          
          {(loading || pipelineData) && (
            <div className="pipeline-tracer">
              <div className="tracer-title"><Activity size={14} /> System Trace Sequence</div>
              
              <div className="trace-step">
                <div className="step-indicator">
                  <div className={`step-dot ${traceStep >= 1 ? 'active' : ''}`}><Search size={14}/></div>
                  <div className="step-line"></div>
                </div>
                <div className="step-content">
                  <h4>Query LLM Router</h4>
                  <p>{traceStep === 1 ? 'Extracting topological targets...' : (traceStep > 1 ? 'Targeting complete.' : 'Waiting...')}</p>
                </div>
              </div>
              
              <div className="trace-step">
                <div className="step-indicator">
                  <div className={`step-dot ${traceStep >= 2 ? 'active' : ''}`}><GitMerge size={14}/></div>
                  <div className="step-line"></div>
                </div>
                <div className="step-content">
                  <h4>Graph Traversal</h4>
                  <p>{traceStep === 2 ? 'Tracing call paths...' : (traceStep > 2 ? `Edges extracted.` : 'Pending...')}</p>
                </div>
              </div>

              <div className="trace-step">
                <div className="step-indicator">
                  <div className={`step-dot ${traceStep >= 3 ? 'active' : ''}`}><Database size={14}/></div>
                  <div className="step-line"></div>
                </div>
                <div className="step-content">
                  <h4>Vector Retrieval</h4>
                  <p>{traceStep === 3 ? 'Fetching embeddings...' : (traceStep > 3 ? `Fetched chunks.` : 'Pending...')}</p>
                </div>
              </div>

              <div className="trace-step">
                <div className="step-indicator">
                  <div className={`step-dot ${traceStep >= 4 ? 'active' : ''}`}><Code size={14}/></div>
                </div>
                <div className="step-content">
                  <h4>Fusion Generation</h4>
                  <p>{traceStep === 4 ? (loading ? 'Synthesizing...' : 'Complete.') : 'Awaiting Retrieval...'}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Area */}
      <main className="main-area">
        {!answer && !loading && (
          <div className="empty-state">
            <motion.div animate={{scale:[1,1.05,1]}} transition={{repeat:Infinity, duration:4}}><Network size={120} style={{opacity:0.1}} /></motion.div>
            <h2>AXON ENGINE PENDING</h2>
            <p>Ready to traverse AST entities and semantic relationships.</p>
          </div>
        )}

        {loading && !answer && (
          <div className="empty-state">
            <motion.div animate={{rotate:360}} transition={{repeat:Infinity, duration:2}}><RefreshCw size={80} style={{opacity:0.1}} /></motion.div>
            <h2>SYNTHESIZING...</h2>
            <p>Wait while AXON fuses structural topology with vector indices.</p>
          </div>
        )}

        {answer && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="answer-card-large"
          >
            <div className="answer-header-premium">
              <div className="header-branding">
                <Cpu size={20} className="header-icon" />
                <div className="title-group">
                  <h4>SYNTHESIS REPORT</h4>
                  <span className="repo-badge">{activeRepo}</span>
                </div>
              </div>

              <div className="header-tabs-switcher">
                <button 
                  onClick={() => setActiveTab('answer')} 
                  className={`switcher-btn ${activeTab === 'answer' ? 'active' : ''}`}
                >
                  <Layout size={14} /> AI Insight
                </button>
                <button 
                  onClick={() => setActiveTab('metadata')} 
                  className={`switcher-btn ${activeTab === 'metadata' ? 'active' : ''}`}
                >
                  <Braces size={14} /> Source Verification
                </button>
              </div>

              <button onClick={handleExplore} className="explorer-btn-top">
                <Maximize size={16} /> OPEN EXPLORER
              </button>
            </div>

            <div className="answer-body scrollable-content">
              {activeTab === 'answer' ? (
                <div className="markdown-answer">
                  <div className="insight-badge"><Activity size={12}/> AI-SYNTHESIZED ARCHITECTURAL REVIEW</div>
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                      strong: ({node, children}) => {
                        const text = children[0]?.toString() || "";
                        let styleClass = "hl-default";
                        if (text.endsWith('.py') || text.endsWith('.js') || text.includes('/')) styleClass = "hl-file";
                        else if (text.includes('(') || /^[a-z_][a-z0-9_]*$/.test(text)) styleClass = "hl-func";
                        else if (/^[A-Z][A-Za-z0-9]*$/.test(text)) styleClass = "hl-class";
                        
                        return <strong className={styleClass}>{children}</strong>;
                      },
                      code: ({node, inline, children}) => {
                        const text = children[0]?.toString() || "";
                        const isShort = !inline && text.trim().split('\n').length === 1 && text.length < 60;
                        
                        if (!inline && !isShort) return <pre><code>{children}</code></pre>;
                        
                        let styleClass = "hl-default";
                        if (text.endsWith('.py') || text.endsWith('.js') || text.includes('/')) styleClass = "hl-file";
                        else if (text.includes('(') || /^[a-z_][a-z0-9_]*$/.test(text)) styleClass = "hl-func";
                        else if (/^[A-Z][A-Za-z0-9]*$/.test(text)) styleClass = "hl-class";
                        
                        return <code className={styleClass}>{children}</code>;
                      }
                    }}
                  >
                    {answer}
                  </ReactMarkdown>
                </div>
              ) : (
                <div style={{display:'grid', gap:'1.5rem'}}>
                  <div className="insight-badge"><Braces size={12}/> RETRIEVED SOURCE VERIFICATION</div>
                  {pipelineData?.semantic_nodes?.map((node, i) => (
                    <div key={i} className="semantic-card">
                      <div className="semantic-loc">
                        <FileText size={14}/> 
                        <span>{node.file}</span>
                        <span style={{opacity:0.5}}>—</span>
                        <span>LINE {node.line}</span>
                      </div>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{`\`\`\`python\n${node.content}\n\`\`\``}</ReactMarkdown>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="answer-footer-premium">
              <div className="answer-footer-legend">
                <div className="legend-item"><div className="dot" style={{background:'#4ade80'}}/> Functions</div>
                <div className="legend-item"><div className="dot" style={{background:'#f472b6'}}/> Classes</div>
                <div className="legend-item"><div className="dot" style={{background:'#9ca3af'}}/> Physical File</div>
              </div>
              <div className="footer-status">
                <Activity size={12} /> AXON CORE SYNTHESIS v2.0
              </div>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}

export default App;
