from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import os
import sys
import subprocess
import shutil
from pathlib import Path

from src.rag.pipeline import RAGPipeline
from src.rag.graph_pipeline import GraphRAGPipeline
from src.rag.hybrid_pipeline import HybridRAGPipeline

app = FastAPI(title="Axon Engine API", description="Backend API for the Axon RAG web platform.")

# Allow CORS for local frontend dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    query: str
    mode: str = "hybrid" # 'vector', 'graph', or 'hybrid'
    repo: str = "default" # Target Repository

@app.get("/")
def health_check():
    return {"status": "Axon API is running."}

class CloneRequest(BaseModel):
    url: str

@app.get("/api/repos")
def list_repos():
    repos_dir = Path("data/repos")
    if not repos_dir.exists():
        return {"repos": []}
    
    repos = []
    for item in repos_dir.iterdir():
        if item.is_dir():
            repos.append(item.name)
        
    return {"repos": repos}

@app.post("/api/repos/clone")
def clone_repo(req: CloneRequest):
    url = req.url.strip()
    if not url.startswith("http"):
        raise HTTPException(status_code=400, detail="Invalid repository URL")
        
    repo_name = url.rstrip("/").split("/")[-1].replace(".git", "")
    repos_dir = Path("data/repos")
    repos_dir.mkdir(parents=True, exist_ok=True)
    target_dir = repos_dir / repo_name
    
    try:
        # Clone repo if it doesn't exist
        if not target_dir.exists():
            subprocess.run(["git", "clone", url, str(target_dir)], check=True)
            
        # Isolate environment variable internally for nested subprocesses
        env = os.environ.copy()
        env["ACTIVE_REPO"] = repo_name
        
        # 1. Trigger AST Graph Builder
        subprocess.run([sys.executable, "src/ast_parser/parser.py", str(target_dir)], check=True, env=env)
        
        # 2. Trigger Vector Semantic Index Builder
        subprocess.run([sys.executable, "src/vector/index_builder.py"], check=True, env=env)
        
        return {"status": "success", "repo": repo_name}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Pipeline Process Failed: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server Error: {str(e)}")

@app.post("/api/query")
def run_query(req: QueryRequest):
    if not req.query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")
        
    # Dynamically isolate the memory space to target repo
    os.environ["ACTIVE_REPO"] = req.repo
    
    try:
        metadata = []
        graph_data = None
        
        if req.mode == "hybrid":
            pipeline = HybridRAGPipeline()
            answer, sources, graph_ctx = pipeline.answer_query(req.query)
            if sources and 'metadatas' in sources and len(sources['metadatas']) > 0:
                metadata = sources['metadatas'][0]
            graph_data = graph_ctx
        elif req.mode == "graph":
            pipeline = GraphRAGPipeline()
            answer, graph_ctx = pipeline.answer_query(req.query)
            graph_data = graph_ctx
        elif req.mode == "vector":
            pipeline = RAGPipeline()
            answer, sources = pipeline.answer_query(req.query)
            if sources and 'metadatas' in sources and len(sources['metadatas']) > 0:
                metadata = sources['metadatas'][0]
        else:
            raise HTTPException(status_code=400, detail="Mode must be 'hybrid', 'graph', or 'vector'")
            
        return {
            "answer": answer, 
            "mode": req.mode,
            "metadata": metadata,
            "graph_data": graph_data
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Engine Error: {str(e)}")

if __name__ == "__main__":
    # Start server locally
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
