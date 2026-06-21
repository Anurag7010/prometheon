"""
memory/long_term_memory.py

ChromaDB-backed user fact store. Uses a SEPARATE collection from documents.
"""

import asyncio
import uuid
from datetime import datetime
from typing import Optional

import chromadb

from core.config import config
from observability.logger import log_pipeline_event


class LongTermMemoryStore:
    """
    Stores and retrieves user-specific facts across sessions.
    Uses ChromaDB with cosine similarity. Separate from the documents collection.
    """

    COLLECTION_NAME = "user_memories"
    SIMILARITY_THRESHOLD = 0.95
    MAX_MEMORIES_PER_USER = 100

    def __init__(self):
        persist_dir = getattr(config, "CHROMA_PERSIST_DIR", "./chroma_db")
        self.client = chromadb.PersistentClient(path=persist_dir)
        self.collection = self.client.get_or_create_collection(
            name=self.COLLECTION_NAME, metadata={"hnsw:space": "cosine"}
        )

    async def store_memory(self, user_id: str, content: str, trace_id: str = None) -> bool:
        """Store a fact. Returns False if near-duplicate exists (similarity >= 0.95)."""
        if await self._is_duplicate(user_id, content):
            log_pipeline_event(
                event="memory_duplicate_skipped",
                trace_id=trace_id,
                metadata={"user_id": user_id, "content_preview": content[:50]},
            )
            return False
        existing = await asyncio.to_thread(
            lambda: self.collection.get(where={"user_id": user_id}, include=["metadatas"])
        )
        if len(existing["ids"]) >= self.MAX_MEMORIES_PER_USER:
            sorted_by_age = sorted(
                zip(existing["ids"], existing["metadatas"]),
                key=lambda x: x[1].get("created_at", ""),
            )
            oldest_id = sorted_by_age[0][0]
            await asyncio.to_thread(lambda: self.collection.delete(ids=[oldest_id]))
        memory_id = str(uuid.uuid4())
        await asyncio.to_thread(
            lambda: self.collection.add(
                ids=[memory_id],
                documents=[content],
                metadatas=[
                    {
                        "user_id": user_id,
                        "created_at": datetime.utcnow().isoformat(),
                        "last_accessed": datetime.utcnow().isoformat(),
                        "access_count": 0,
                    }
                ],
            )
        )
        log_pipeline_event(
            event="memory_stored",
            trace_id=trace_id,
            metadata={"user_id": user_id, "memory_id": memory_id, "content_preview": content[:50]},
        )
        return True

    async def retrieve_memories(
        self, user_id: str, query: str, top_k: int = 5, trace_id: str = None
    ) -> list[dict]:
        """Retrieve top-K relevant memories for a user. Updates access metadata."""
        results = await asyncio.to_thread(
            lambda: self.collection.query(
                query_texts=[query],
                n_results=min(top_k, self.MAX_MEMORIES_PER_USER),
                where={"user_id": user_id},
                include=["documents", "metadatas", "distances"],
            )
        )
        if not results.get("ids") or not results["ids"][0]:
            return []
        memories = []
        update_ids = []
        update_metadatas = []
        now = datetime.utcnow().isoformat()
        for i, memory_id in enumerate(results["ids"][0]):
            content = results["documents"][0][i]
            metadata = results["metadatas"][0][i]
            distance = results["distances"][0][i]
            similarity = 1 - distance
            memories.append(
                {
                    "id": memory_id,
                    "content": content,
                    "similarity": round(similarity, 3),
                    "created_at": metadata.get("created_at"),
                    "access_count": metadata.get("access_count", 0),
                }
            )
            update_ids.append(memory_id)
            update_metadatas.append(
                {
                    **metadata,
                    "last_accessed": now,
                    "access_count": metadata.get("access_count", 0) + 1,
                }
            )
        if update_ids:
            await asyncio.to_thread(
                lambda: self.collection.update(ids=update_ids, metadatas=update_metadatas)
            )
        log_pipeline_event(
            event="memory_retrieved",
            trace_id=trace_id,
            metadata={
                "user_id": user_id,
                "count": len(memories),
                "top_similarity": memories[0]["similarity"] if memories else 0,
            },
        )
        return memories

    async def list_memories(self, user_id: str) -> list[dict]:
        """List all memories for a user (for settings UI)."""
        results = await asyncio.to_thread(
            lambda: self.collection.get(
                where={"user_id": user_id}, include=["documents", "metadatas"]
            )
        )
        return [
            {"id": results["ids"][i], "content": results["documents"][i], **results["metadatas"][i]}
            for i in range(len(results["ids"]))
        ]

    async def delete_memory(self, memory_id: str, user_id: str) -> bool:
        """Delete a memory. Verifies ownership before deleting."""
        existing = await asyncio.to_thread(
            lambda: self.collection.get(ids=[memory_id], include=["metadatas"])
        )
        if not existing["ids"]:
            return False
        if existing["metadatas"][0].get("user_id") != user_id:
            return False
        await asyncio.to_thread(lambda: self.collection.delete(ids=[memory_id]))
        return True

    async def _is_duplicate(self, user_id: str, content: str) -> bool:
        """Return True if a very similar memory already exists (similarity >= 0.95)."""
        try:
            results = await asyncio.to_thread(
                lambda: self.collection.query(
                    query_texts=[content],
                    n_results=1,
                    where={"user_id": user_id},
                    include=["distances"],
                )
            )
            if results.get("distances") and results["distances"][0]:
                similarity = 1 - results["distances"][0][0]
                return similarity >= self.SIMILARITY_THRESHOLD
        except Exception as exc:
            log_pipeline_event(
                event="memory_duplicate_check_error",
                trace_id=None,
                metadata={"error": str(exc)},
            )
            return False
        return False
