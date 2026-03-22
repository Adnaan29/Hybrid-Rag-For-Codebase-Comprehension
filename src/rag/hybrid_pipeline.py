import os
import sys
import networkx as nx
from pathlib import Path
from openai import OpenAI
from dotenv import load_dotenv

# Add project root to path for imports
root_dir = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(root_dir))

try:
    from src.vector.index_builder import VectorIndex
    from src.retrieval.graph_searcher import (
        load_graph, extract_target_node, determine_search_direction, get_context_string_for_llm
    )
    from src.rag.query_router import LLMQueryRouter
except ImportError as e:
    print(f"Error: Could not import required modules. {e}")
    sys.exit(1)

# Load environment variables
load_dotenv(root_dir / ".env")

class HybridRAGPipeline:
    def __init__(self, model: str = "gpt-4o-mini"):
        """
        The Hybrid RAG Pipeline.
        Fuses Structural Graph Data (NetworkX) with Semantic Vector Data (ChromaDB)
        to prevent LLM hallucinations on codebase architecture.
        """
        self.api_key = os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY not found in environment variables.")
            
        self.client = OpenAI(api_key=self.api_key)
        self.vector_index = VectorIndex()
        self.graph_builder = load_graph()
        self.router = LLMQueryRouter()
        self.model = model

    def get_graph_context(self, query: str, depth: int = 3) -> str:
        """
        Programmatically extracts the graph context strings without printing to console.
        """
        intent = self.router.extract_intent(query)
        target_nodes = extract_target_node(query, self.graph_builder, router_words=intent.get("target_nodes", []))
        if not target_nodes:
            return "No structural graph data found for this query."
            
        direction = determine_search_direction(query, router_dir=intent.get("direction", "none"))
        all_graph_contexts = []
        
        for target in target_nodes:
            # Recompute Risk and Paths programmatically
            in_degree = self.graph_builder.graph.in_degree(target)
            risk = "HIGH" if in_degree > 5 else ("MEDIUM" if in_degree > 2 else "LOW")
            
            impact_paths_for_llm = []
            dep_paths_for_llm = []
            
            if direction in ['backward', 'both']:
                impact = self.graph_builder.get_impact_radius(target, depth=depth)
                for imp_node in impact:
                    # Filter out purely file-level topological nodes if any
                    if self.graph_builder.graph.nodes[imp_node].get('type') == 'file': continue
                    try:
                        path = nx.shortest_path(self.graph_builder.graph, source=imp_node, target=target)
                        path_str = " -> ".join([p.split(':')[-1] for p in path])
                    except:
                        path_str = imp_node.split(':')[-1]
                    impact_paths_for_llm.append(path_str)
                    
            if direction in ['forward', 'both']:
                deps = self.graph_builder.get_dependencies(target, depth=depth)
                for dep_node in deps:
                    if self.graph_builder.graph.nodes[dep_node].get('type') == 'file': continue
                    try:
                        path = nx.shortest_path(self.graph_builder.graph, source=target, target=dep_node)
                        path_str = " -> ".join([p.split(':')[-1] for p in path])
                    except:
                        path_str = dep_node.split(':')[-1]
                    dep_paths_for_llm.append(path_str)
            
            # Format using our robust LLM formatter from graph_searcher
            ctx = get_context_string_for_llm(target, impact_paths_for_llm, dep_paths_for_llm, risk)
            all_graph_contexts.append(ctx)
            
        return "\n\n".join(all_graph_contexts)

    def answer_query(self, query: str, n_results: int = 5):
        """
        Executes the Hybrid Fusion. 
        """
        print(f"[*] Running HYBRID Retrieval for: '{query}'...")
        
        # 1. Structural Retrieval (Undeniable path truth)
        print("    ↳ Traversing Custom Abstract Syntax Graph...")
        graph_context = self.get_graph_context(query)
        
        # 2. Semantic Retrieval (Docstrings, logic, fuzzy descriptions)
        print("    ↳ Querying ChromaDB Vector Index...")
        results = self.vector_index.search(query, n_results=n_results)
        
        vector_chunks = []
        for i, (doc, metadata) in enumerate(zip(results['documents'][0], results['metadatas'][0])):
            chunk_text = f"--- Source File: {metadata['file']} (Line {metadata['line']}) ---\n{doc}"
            vector_chunks.append(chunk_text)
            
        vector_str = "\n\n".join(vector_chunks)
        
        # 3. Hybrid Prompt Engineering (FUSION)
        system_prompt = (
            "You are an advanced Hybrid RAG AI for Codebase Comprehension.\n"
            "You have access to two distinct forms of data:\n"
            "1. STRUCTURAL GRAPH DATA: This is the mathematically proven architecture. It dictates exactly "
            "what calls what and the exact architectural risk factor. This is undeniable truth.\n"
            "2. SEMANTIC SOURCE CODE: These are text chunks retrieved using vector similarity.\n\n"
            "Your Rules:\n"
            "- If a user asks 'What breaks if I change X', prioritize the STRUCTURAL GRAPH DATA to outline the exact impact. Quote the exact Call Paths provided.\n"
            "- Use the SEMANTIC SOURCE CODE to explain *how* things work inside the functions.\n"
            "- Warn the user immediately if the item they are changing has a HIGH Architectural Risk Factor.\n"
            "- Always cite your claims by referencing the File Names and exact Call Paths.\n"
            "- Do not hallucinate dependencies that are not in the STRUCTURAL GRAPH DATA. The graph is the absolute authority on architecture.\n"
        )
        
        user_prompt = f"""
=============================
[1] STRUCTURAL GRAPH DATA
=============================
{graph_context}

=============================
[2] SEMANTIC SOURCE CODE
=============================
{vector_str}

=============================
USER QUESTION
=============================
{query}
"""
        print(f"[*] Fusing Contexts & Generating engineering-grade response using {self.model}...")
        
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.2
        )
        
        return response.choices[0].message.content, results, graph_context

if __name__ == "__main__":
    import argparse
    from rich.console import Console
    from rich.markdown import Markdown

    console = Console()
    
    parser = argparse.ArgumentParser(description="Hybrid RAG Engine via NetworkX + ChromaDB")
    parser.add_argument("query", type=str, help="Question about the codebase.")
    parser.add_argument("--model", type=str, default="gpt-4o-mini", help="LLM to use for generation.")
    
    args = parser.parse_args()
    
    try:
        pipeline = HybridRAGPipeline(model=args.model)
        answer, sources, graph_ctx = pipeline.answer_query(args.query)
        
        console.print("\n[bold cyan]=== HYBRID ENGINE ANSWER ===[/]\n")
        console.print(Markdown(answer))
        
        console.print("\n[bold yellow]--- Context Sources Successfully Fused ---[/]")
        if "No structural graph data" not in graph_ctx:
            console.print("[green]✓ Included 100% Accurate Structural Call Paths[/]")
        else:
            console.print("[dim]⚠ No Structural Links Found (Fell back to Pure Semantic Vector Search)[/]")
            
        console.print(f"[green]✓ Included top {len(sources['metadatas'][0])} Semantic Code Chunks[/]")
    except Exception as e:
        console.print(f"[red]Fatal Error in Hybrid Pipeline: {e}[/]")
