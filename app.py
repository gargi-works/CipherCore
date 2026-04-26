import os
import json
import re
import requests
from dotenv import load_dotenv
load_dotenv()
FEATHERLESS_API_KEY = os.getenv("FEATHERLESS_API_KEY")

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)


def analyze_message(text: str, source: str):
    
    """
    AI-based message analysis using Featherless AI (OpenAI-compatible API).

    Returns a dict with:
      { "label": "Safe|Suspicious|Dangerous", "score": 0-100, "reason": "...", "action": "..." }

    Falls back to a safe default if the AI response is invalid or the API fails.
    """
    fallback = {
        "label": "Suspicious",
        "score": 50,
        "reason": "AI service unavailable",
        "action": "Try again later",
    }

    # Basic input cleanup
    text = (text or "").strip()
    if not text:
        return {
            "label": "Safe",
            "score": 0,
            "reason": "Empty message.",
            "action": "No action needed.",
        }

    # If the key is missing, fail gracefully
    if not FEATHERLESS_API_KEY:
        return fallback

    endpoint = "https://api.featherless.ai/v1/chat/completions"

    # Prompt: instruct the model to output ONLY valid JSON (no markdown, no extra text)
    prompt = f"""
Analyze the following message for potential risks in communication.

Source: {source}
Message: "{text}"

Classify the message into one of:
- Safe
- Suspicious
- Dangerous

Evaluate based on:
1. Threats or harassment
2. Scam or fraud patterns
3. Impersonation (pretending to be official authority)
4. Social engineering tactics

Specifically detect:
- Internship/job scams (fake offers, unrealistic benefits, vague companies)
- Email scams (phishing, suspicious links, urgency)
- Account hacking attempts (asking for OTP, links, credentials)
- Messages pushing users to share/forward content
- Use of urgency, pressure, or fear tactics
- Claims of affiliation with known institutions without verification

Guidelines:
- If direct harm or threat → Dangerous
- If suspicious intent, scam-like behavior, or manipulation → Suspicious
- If normal harmless message → Safe

Also provide:
- Risk score (0–100)
- Short explanation (why it is risky or safe)
- Suggested action (Ignore / Verify / Block / Report)

Respond ONLY in JSON format:
{{
  "label": "Safe/Suspicious/Dangerous",
  "score": number,
  "reason": "short explanation",
  "action": "recommended action"
}}
"""

    payload = {
        "model": "deepseek-ai/DeepSeek-V3.2",
        "messages": [
            {"role": "system", "content": "You are a threat-detection classifier. Output ONLY valid JSON. No markdown."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
    }

    headers = {
        "Authorization": f"Bearer {FEATHERLESS_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        # Timeout keeps your app responsive if the AI service is slow
        resp = requests.post(endpoint, headers=headers, json=payload, timeout=15)
        resp.raise_for_status()

        data = resp.json()
        content = (
            data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
        ).strip()

        # Safely extract the first JSON object found (handles occasional extra text)
        match = re.search(r"\{[\s\S]*\}", content)
        if not match:
            return fallback

        result = json.loads(match.group(0))

        # Minimal validation (ensures predictable output)
        label = str(result.get("label", "")).strip().title()
        score = result.get("score", None)
        reason = str(result.get("reason", "")).strip()
        action = str(result.get("action", "")).strip()

        if label not in {"Safe", "Suspicious", "Dangerous"}:
            return fallback

        try:
            score = int(float(score))
        except Exception:
            return fallback

        score = max(0, min(100, score))

        if not reason or not action:
            return fallback

        return {
            "label": label,
            "score": score,
            "reason": reason,
            "action": action,
        }

    except Exception as e:
        print("ERROR:", str(e))   # 👈 ADD THIS
        return fallback
@app.get("/")
def index():
    return render_template("index.html")


@app.post("/analyze")
def analyze():
    data = request.get_json(silent=True) or {}
    message = data.get("message", "")
    source = data.get("source", "Unknown")

    result = analyze_message(message, source)

    # Send to n8n only if risky
    if result["label"] in ["Suspicious", "Dangerous"]:
        try:
            requests.post(
                "https://gargishringare.app.n8n.cloud/webhook-test/ciphercore-alert",
                json={
                    "message": message,
                    "label": result["label"],
                    "score": result["score"],
                    "reason": result["reason"],
                    "source": source
                },
                timeout=5
            )
        except:
            pass  # don't break app if n8n fails

    result["reason"] = f"[Source: {source}] {result['reason']}"

    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True)