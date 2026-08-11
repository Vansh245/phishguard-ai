"""
PhishGuard AI Assistant — OpenAI-backed chat with function-calling.
The model can call `scan_url` mid-conversation, which runs the REAL local
phishing classifier (model/predict.py) — not a mock. The OpenAI key stays
server-side; the frontend never sees it.
"""
import os
import json

from openai import OpenAI

from model.predict import predict as _predict

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
CHAT_MODEL = os.environ.get("OPENAI_CHAT_MODEL", "gpt-4o-mini")

_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

SYSTEM_PROMPT = (
    "You are the PhishGuard AI Assistant, a helpful cybersecurity copilot "
    "embedded in a phishing detection platform. You help users understand "
    "phishing threats, explain suspicious emails or messages, and can scan "
    "any URL for phishing using the scan_url tool — always use it when the "
    "user shares a link or asks you to check one, rather than guessing. "
    "Explain scan results in plain, non-technical language. Keep answers "
    "concise and practical. You are not a general-purpose assistant — stay "
    "focused on phishing, scams, and online safety."
)

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "scan_url",
            "description": (
                "Scan a URL with PhishGuard's real ML phishing classifier. "
                "Returns a verdict (PHISHING/SAFE), confidence, and evidence."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "The URL to scan"},
                },
                "required": ["url"],
            },
        },
    }
]


def _run_scan_tool(url: str) -> dict:
    try:
        result = _predict(url.strip())
        return result
    except Exception as e:
        return {"url": url, "error": str(e)}


def chat(history: list[dict]) -> dict:
    """
    history: list of {"role": "user"|"assistant", "content": str}
    Returns: {"reply": str, "scans": [scan_result, ...]}
    """
    if _client is None:
        raise RuntimeError(
            "OPENAI_API_KEY is not configured on the server. "
            "Set it as an environment variable to enable the AI Assistant."
        )

    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + history
    scans_performed = []

    # Allow a couple of tool-call round-trips (e.g. scan, then answer)
    for _ in range(4):
        response = _client.chat.completions.create(
            model=CHAT_MODEL,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
        )
        choice = response.choices[0]
        msg = choice.message

        if not msg.tool_calls:
            return {"reply": msg.content or "", "scans": scans_performed}

        # Model wants to call scan_url — execute it for real, then let the
        # model see the result and continue.
        messages.append({
            "role": "assistant",
            "content": msg.content,
            "tool_calls": [tc.model_dump() for tc in msg.tool_calls],
        })

        for tc in msg.tool_calls:
            args = json.loads(tc.function.arguments or "{}")
            url = args.get("url", "")
            result = _run_scan_tool(url)
            if "error" not in result:
                scans_performed.append(result)
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(result),
            })

    # Safety net if the loop above didn't return (too many tool calls)
    return {
        "reply": "I ran into trouble finishing that analysis — could you try rephrasing?",
        "scans": scans_performed,
    }
