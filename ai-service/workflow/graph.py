from __future__ import annotations

from typing import Any

from langgraph.graph import END, StateGraph

from rag.retriever import retrieve_documents


def build_graph(state_type: type[dict[str, Any]] = dict) -> StateGraph:
    graph = StateGraph(state_type)

    def route(state: dict[str, Any]) -> dict[str, Any]:
        if state.get("requires_rag"):
            state["rag_context"] = retrieve_documents(state.get("message", ""))
        return state

    graph.add_node("route", route)
    graph.set_entry_point("route")
    graph.add_edge("route", END)
    return graph
