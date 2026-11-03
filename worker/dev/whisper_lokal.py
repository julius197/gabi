"""Lokale Spracherkennung für den Testmodus (gleiches Modell wie Cloudflare: Whisper large v3 turbo).
Aufruf: python whisper_lokal.py aufnahme.wav "Prompt"  → JSON {text, segments} auf stdout.
Braucht: pip install mlx-whisper (Apple Silicon); das Modell muss schon heruntergeladen sein."""
import json
import sys

import mlx_whisper

ergebnis = mlx_whisper.transcribe(
    sys.argv[1],
    path_or_hf_repo="mlx-community/whisper-large-v3-turbo",
    language="de",
    initial_prompt=sys.argv[2] if len(sys.argv) > 2 else None,
    condition_on_previous_text=False,
)
print(json.dumps({"text": ergebnis.get("text", ""), "segments": [{"text": s.get("text", "")} for s in ergebnis.get("segments", [])]}, ensure_ascii=False))
