from typing import List, Literal, Optional
import asyncio
import time
import json
import os

from urllib.parse import quote as url_quote
from pathlib import Path

import requests
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from duckduckgo_search import DDGS
from langchain_openai import ChatOpenAI
from langchain_community.tools import DuckDuckGoSearchRun
from langchain_community.utilities import DuckDuckGoSearchAPIWrapper
from langchain_core.prompts import ChatPromptTemplate


app = FastAPI(title="Local AI Search Engine", version="0.1.0")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SearchRequest(BaseModel):
    query: str
    mode: Literal["all", "web", "ai"] = "all"
    max_results: int = 6


class SearchResult(BaseModel):
    title: str
    url: Optional[str] = None
    snippet: str
    source: Literal["duckduckgo", "ai", "fusion"]
    score: Optional[float] = None


class ImageResult(BaseModel):
    title: Optional[str] = None
    url: str
    thumbnail: Optional[str] = None
    source: str = "duckduckgo"


class SearchResponse(BaseModel):
    query: str
    refined_query: str
    mode: str
    results: List[SearchResult]
    ai_summary: str
    key_takeaways: List[str]
    followup_questions: List[str]
    latency_ms: int


class WebSearchResponse(BaseModel):
    query: str
    results: List[SearchResult]
    latency_ms: int


class ImageSearchResponse(BaseModel):
    query: str
    images: List[ImageResult]
    latency_ms: int


def build_llm() -> ChatOpenAI:
    """(Deprecated) Old LM Studio client kept for reference; not used now."""

    return ChatOpenAI(
        model="local-model",
        base_url="http://localhost:1234/v1",
        api_key="lm-studio",
        temperature=0.4,
    )


# Configure DuckDuckGo wrapper to better match browser behaviour
duckduckgo_wrapper = DuckDuckGoSearchAPIWrapper(
    region="in-en",  # India + English, like your browser settings
    time="d",        # Bias towards fresh (last day) results
    max_results=10,
)

web_search_tool = DuckDuckGoSearchRun(api_wrapper=duckduckgo_wrapper)


HF_ROUTER_URL = "https://router.huggingface.co/v1/chat/completions"


def call_qwen_router(prompt: str) -> str:
    """Call Qwen3-Coder via Hugging Face router using HF_TOKEN env var.

    The prompt should already contain instructions to respond as JSON
    with keys: final_answer, key_takeaways, followups.
    """

    token = os.getenv("HF_TOKEN")
    if not token:
        return "{\n  \"final_answer\": \"HF_TOKEN not set. Please configure it in the environment.\",\n  \"key_takeaways\": [],\n  \"followups\": []\n}"

    try:
        response = requests.post(
            HF_ROUTER_URL,
            headers={"Authorization": f"Bearer {token}"},
            json={
                "messages": [
                    {
                        "role": "user",
                        "content": prompt,
                    }
                ],
                "model": "Qwen/Qwen3-Coder-30B-A3B-Instruct:nebius",
            },
            timeout=120,
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]
    except Exception as e:  # pragma: no cover - defensive
        return (
            "{\n  \"final_answer\": \"Qwen router call failed: "
            + str(e).replace("\"", "'")
            + "\",\n  \"key_takeaways\": [],\n  \"followups\": []\n}"
        )


async def run_reflexive_search(query: str, mode: str, max_results: int) -> SearchResponse:
    """Run a simple web search + LLM summary pipeline and format a response."""

    start_time = time.time()

    # 1) Run DuckDuckGo search synchronously in a thread so we don't block the event loop
    loop = asyncio.get_event_loop()

    def _run_web_search(q: str) -> str:
        try:
            return str(web_search_tool.run(q))
        except Exception as e:  # pragma: no cover - just defensive
            return f"Web search failed: {e}"

    web_text = ""
    if mode in {"all", "web", "ai"}:  # keep same modes as original
        web_text = await loop.run_in_executor(None, lambda: _run_web_search(query))

    # Package one synthetic "result" from the web text
    results: List[SearchResult] = []
    if web_text:
        results.append(
            SearchResult(
                title="Web result from DuckDuckGo",
                url=None,
                snippet=web_text[:500],
                source="duckduckgo",
                score=None,
            )
        )

    # 2) Ask Qwen3 via Hugging Face router to summarize and suggest follow-ups
    critique_prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are a search assistant. Use the web evidence to answer "
                "the user's query clearly. Then provide 3-5 bullet key "
                "takeaways and 3-5 follow-up questions. Respond as JSON with "
                "keys: final_answer, key_takeaways, followups.",
            ),
            (
                "user",
                "User query: {query}\n\nWeb evidence:\n{evidence}",
            ),
        ]
    )

    evidence_concat = "\n\n".join(r.snippet for r in results[:max_results])
    critique_msgs = critique_prompt.format_messages(
        query=query, evidence=evidence_concat or "(no web evidence available)"
    )
    # Flatten LangChain messages into a single prompt string
    prompt_text = "\n\n".join(getattr(m, "content", str(m)) for m in critique_msgs)
    critique_content = call_qwen_router(prompt_text)

    final_answer = ""
    key_takeaways: List[str] = []
    followups: List[str] = []

    try:
        data = json.loads(critique_content)
        final_answer = data.get("final_answer", "") or ""
        key_takeaways = data.get("key_takeaways", []) or []
        followups = data.get("followups", []) or []
    except Exception:
        # If the model did not return valid JSON, just use raw text
        final_answer = critique_content

    latency_ms = int((time.time() - start_time) * 1000)
    refined_query = query

    return SearchResponse(
        query=query,
        refined_query=refined_query,
        mode=mode,
        results=results[:max_results],
        ai_summary=final_answer,
        key_takeaways=key_takeaways,
        followup_questions=followups,
        latency_ms=latency_ms,
    )


@app.post("/search", response_model=SearchResponse)
async def search(req: SearchRequest) -> SearchResponse:
    return await run_reflexive_search(req.query, req.mode, req.max_results)


@app.post("/web_search", response_model=WebSearchResponse)
async def web_search(req: SearchRequest) -> WebSearchResponse:
    """Fast DuckDuckGo search endpoint for regular web-style results."""

    start_time = time.time()
    loop = asyncio.get_event_loop()

    def _run_results(q: str, limit: int, region: str):
        # Use duckduckgo_search; pass region to the text() call (constructor has no region param)
        with DDGS() as ddgs:
            return list(ddgs.text(q, max_results=limit, region=region))

    limit = max(req.max_results, 10)
    results: List[SearchResult] = []

    try:
        # First try India+English to match your browser; if that returns nothing,
        # fall back to a global region for better coverage.
        raw_list = await loop.run_in_executor(
            None, lambda: _run_results(req.query, limit, "in-en")
        )
        if not raw_list:
            raw_list = await loop.run_in_executor(
                None, lambda: _run_results(req.query, limit, "wt-wt")
            )
        blocked_hosts = ["zhihu.com", "baidu.com", ".cn", "jeuxvideo.com"]

        filtered: List[SearchResult] = []

        # First pass: apply domain filter
        for item in raw_list:
            try:
                title = str(item.get("title") or item.get("href") or "Result")
                url = item.get("href") or None
                snippet = str(item.get("body") or item)

                # Skip obviously non-English/China-focused domains
                if url and any(b in url for b in blocked_hosts):
                    continue

                filtered.append(
                    SearchResult(
                        title=title,
                        url=url,
                        snippet=snippet[:500],
                        source="duckduckgo",
                        score=None,
                    )
                )
            except Exception:
                continue

        # If filtering removed everything but DuckDuckGo did return items,
        # fall back to the unfiltered list so the user still sees real results.
        if filtered or not raw_list:
            results = filtered
        else:
            for item in raw_list:
                try:
                    title = str(item.get("title") or item.get("href") or "Result")
                    url = item.get("href") or None
                    snippet = str(item.get("body") or item)
                    results.append(
                        SearchResult(
                            title=title,
                            url=url,
                            snippet=snippet[:500],
                            source="duckduckgo",
                            score=None,
                        )
                    )
                except Exception:
                    continue
    except Exception:
        # If DuckDuckGo fails entirely, just return empty results instead of 500
        results = []

    # If DuckDuckGo returns an empty list but no error, just pass that through
    # so the frontend accurately shows "No web results" instead of dummy links.

    latency_ms = int((time.time() - start_time) * 1000)

    return WebSearchResponse(query=req.query, results=results, latency_ms=latency_ms)


@app.post("/image_search", response_model=ImageSearchResponse)
async def image_search(req: SearchRequest) -> ImageSearchResponse:
    start_time = time.time()
    loop = asyncio.get_event_loop()

    def _run_images(q: str, limit: int):
        with DDGS() as ddgs:
            return list(ddgs.images(q, max_results=limit, region="in-en"))

    images: List[ImageResult] = []
    try:
        raw_list = await loop.run_in_executor(None, lambda: _run_images(req.query, 12))

        for item in raw_list:
            try:
                url = str(item.get("image") or item.get("thumbnail"))
                if not url:
                    continue
                title = item.get("title") or item.get("source")
                thumb = item.get("thumbnail") or None
                images.append(
                    ImageResult(
                        title=str(title) if title else None,
                        url=url,
                        thumbnail=str(thumb) if thumb else None,
                    )
                )
            except Exception:
                continue
    except Exception:
        # On total failure, return empty image list instead of 500
        images = []

    latency_ms = int((time.time() - start_time) * 1000)

    return ImageSearchResponse(query=req.query, images=images, latency_ms=latency_ms)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
