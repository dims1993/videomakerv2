"""
Minimal WhisperX forced-alignment HTTP server for VideoMaker.

GET  /health
POST /align  multipart: file, text, language → { words: [{ word, start, end }] }

Alignment strategy (v2):
- Prefer a single full-duration segment so wav2vec2 is not biased by
  equal-time sentence windows (the old approach caused slips/stickiness).
- For long clips, split by sentence but allocate time *proportionally*
  to word count (not equal slices).
- Always post-process word timings: clamp, monotonic, min duration, no overlap.
"""

from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

app = FastAPI(title="WhisperX Align Server", version="1.1.0")

_ALIGN_MODEL = None
_ALIGN_META: dict[str, Any] | None = None
_ALIGN_LANG: str | None = None
_DEVICE = (os.environ.get("WHISPERX_DEVICE") or "cpu").strip() or "cpu"

# Prefer one window for typical scene VO; longer clips use proportional splits.
_SINGLE_SEGMENT_MAX_DURATION_SEC = float(
    os.environ.get("WHISPERX_SINGLE_SEGMENT_MAX_SEC") or "45"
)
_SINGLE_SEGMENT_MAX_WORDS = int(os.environ.get("WHISPERX_SINGLE_SEGMENT_MAX_WORDS") or "90")
_MIN_WORD_DURATION_SEC = float(os.environ.get("WHISPERX_MIN_WORD_DUR_SEC") or "0.05")


def _port_from_env() -> int:
    raw = (os.environ.get("PORT") or "").strip()
    if raw.isdigit():
        return int(raw)
    base = (os.environ.get("WHISPERX_BASE_URL") or "http://127.0.0.1:8011").strip()
    try:
        parsed = urlparse(base)
        if parsed.port:
            return int(parsed.port)
    except Exception:
        pass
    return 8011


def _normalize_alignment_text(text: str) -> str:
    clean = re.sub(r"\s+", " ", (text or "").strip())
    if not clean:
        raise HTTPException(status_code=400, detail="Alignment text is empty.")
    return clean


def _sentence_parts(text: str) -> list[str]:
    parts = [p.strip() for p in re.split(r"(?<=[.!?])\s+", text) if p.strip()]
    return parts if parts else [text]


def build_alignment_segments(text: str, duration: float) -> list[dict[str, Any]]:
    """
    Build WhisperX transcript segments for forced alignment.

    Default: one segment spanning the whole audio (best for short/medium VO).
    Long clips: sentence parts with time proportional to word count.
    """
    clean = _normalize_alignment_text(text)
    if duration <= 0:
        raise HTTPException(status_code=400, detail="Audio duration must be positive.")

    words = clean.split()
    word_count = len(words)
    use_single = (
        duration <= _SINGLE_SEGMENT_MAX_DURATION_SEC
        or word_count <= _SINGLE_SEGMENT_MAX_WORDS
    )
    if use_single or word_count <= 1:
        return [{"start": 0.0, "end": float(duration), "text": clean}]

    parts = _sentence_parts(clean)
    if len(parts) <= 1:
        return [{"start": 0.0, "end": float(duration), "text": clean}]

    weights = [max(len(part.split()), 1) for part in parts]
    total_weight = float(sum(weights))
    segments: list[dict[str, Any]] = []
    cursor = 0.0
    for index, (part, weight) in enumerate(zip(parts, weights)):
        if index == len(parts) - 1:
            start = cursor
            end = float(duration)
        else:
            slice_len = max(duration * (weight / total_weight), 0.05)
            start = cursor
            end = min(duration, cursor + slice_len)
            cursor = end
        if end <= start:
            end = min(duration, start + 0.05)
        segments.append({"start": float(start), "end": float(end), "text": part})
    # Ensure last segment reaches duration even with float drift.
    if segments:
        segments[-1]["end"] = float(duration)
        if segments[-1]["end"] <= float(segments[-1]["start"]):
            segments[-1]["start"] = max(0.0, float(duration) - 0.05)
    return segments


def postprocess_aligned_words(
    words: list[dict[str, Any]],
    duration: float,
    *,
    min_word_dur: float = _MIN_WORD_DURATION_SEC,
) -> list[dict[str, Any]]:
    """Clamp, sort, enforce monotonic non-overlapping timings, expand tiny words."""
    cleaned: list[dict[str, Any]] = []
    for entry in words:
        if not isinstance(entry, dict):
            continue
        word = str(entry.get("word") or entry.get("text") or "").strip()
        start = entry.get("start")
        end = entry.get("end")
        if not word or start is None or end is None:
            continue
        try:
            start_f = float(start)
            end_f = float(end)
        except (TypeError, ValueError):
            continue
        if end_f < start_f:
            start_f, end_f = end_f, start_f
        cleaned.append({"word": word, "start": start_f, "end": end_f})

    if not cleaned:
        return []

    cleaned.sort(key=lambda item: (item["start"], item["end"]))
    duration_f = max(float(duration), 0.0)
    min_dur = max(float(min_word_dur), 0.01)
    result: list[dict[str, Any]] = []

    for item in cleaned:
        start = max(0.0, min(item["start"], duration_f))
        end = max(0.0, min(item["end"], duration_f))
        if end < start:
            end = start
        if result:
            prev = result[-1]
            if start < prev["end"]:
                # Split the overlap at midpoint when both claim the same region.
                mid = (prev["end"] + start) / 2.0
                prev["end"] = max(prev["start"], mid)
                start = max(start, prev["end"])
            if start < prev["end"]:
                start = prev["end"]
        if end - start < min_dur:
            end = min(duration_f, start + min_dur)
        if result and start < result[-1]["end"]:
            start = result[-1]["end"]
            end = max(end, start + min_dur)
            end = min(end, duration_f)
        if end <= start and duration_f > 0:
            end = min(duration_f, start + min_dur)
        result.append({"word": item["word"], "start": float(start), "end": float(end)})

    # Final pass: keep strictly increasing and within duration.
    for index in range(1, len(result)):
        prev = result[index - 1]
        cur = result[index]
        if cur["start"] < prev["end"]:
            cur["start"] = prev["end"]
        if cur["end"] <= cur["start"]:
            cur["end"] = min(duration_f, cur["start"] + min_dur)
        if cur["end"] > duration_f:
            cur["end"] = duration_f
        if cur["start"] > duration_f:
            cur["start"] = duration_f
            cur["end"] = duration_f

    if result and duration_f > 0:
        result[-1]["end"] = max(result[-1]["end"], min(duration_f, result[-1]["start"] + min_dur))
        result[-1]["end"] = min(result[-1]["end"], duration_f)

    return result


def _ensure_align_model(language: str):
    global _ALIGN_MODEL, _ALIGN_META, _ALIGN_LANG
    lang = (language or "en").strip().lower() or "en"
    if _ALIGN_MODEL is not None and _ALIGN_LANG == lang:
        return _ALIGN_MODEL, _ALIGN_META

    try:
        import whisperx
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="whisperx is not installed in WhisperX-Server/venv. See WhisperX-Server/README.md.",
        ) from exc

    model, metadata = whisperx.load_align_model(language_code=lang, device=_DEVICE)
    _ALIGN_MODEL = model
    _ALIGN_META = metadata
    _ALIGN_LANG = lang
    return _ALIGN_MODEL, _ALIGN_META


def _words_from_aligned(aligned: dict[str, Any]) -> list[dict[str, Any]]:
    words: list[dict[str, Any]] = []
    # Prefer top-level word list when present.
    top_level = aligned.get("word_segments") or aligned.get("words")
    if isinstance(top_level, list) and top_level:
        for entry in top_level:
            if not isinstance(entry, dict):
                continue
            word = str(entry.get("word") or entry.get("text") or "").strip()
            start = entry.get("start")
            end = entry.get("end")
            if not word or start is None or end is None:
                continue
            try:
                words.append(
                    {"word": word, "start": float(start), "end": float(end)}
                )
            except (TypeError, ValueError):
                continue
        if words:
            return words

    for segment in aligned.get("segments") or []:
        if not isinstance(segment, dict):
            continue
        for entry in segment.get("words") or []:
            if not isinstance(entry, dict):
                continue
            word = str(entry.get("word") or entry.get("text") or "").strip()
            start = entry.get("start")
            end = entry.get("end")
            if not word or start is None or end is None:
                continue
            try:
                words.append(
                    {
                        "word": word,
                        "start": float(start),
                        "end": float(end),
                    }
                )
            except (TypeError, ValueError):
                continue
    return words


@app.get("/health")
def health():
    return {
        "ok": True,
        "device": _DEVICE,
        "alignStrategy": "single_or_proportional_v2",
        "singleSegmentMaxSec": _SINGLE_SEGMENT_MAX_DURATION_SEC,
        "singleSegmentMaxWords": _SINGLE_SEGMENT_MAX_WORDS,
    }


@app.post("/align")
async def align(
    file: UploadFile = File(...),
    text: str = Form(...),
    language: str = Form("en"),
):
    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Audio file is empty.")

    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(raw)
            tmp_path = tmp.name

        try:
            import whisperx
        except ImportError as exc:
            raise HTTPException(
                status_code=503,
                detail="whisperx is not installed in WhisperX-Server/venv. See WhisperX-Server/README.md.",
            ) from exc

        audio = whisperx.load_audio(tmp_path)
        duration = float(len(audio) / 16000.0) if audio is not None else 0.0
        if duration <= 0:
            raise HTTPException(status_code=400, detail="Could not read audio duration.")

        segments = build_alignment_segments(text, duration)
        model_a, metadata = _ensure_align_model(language)
        aligned = whisperx.align(
            segments,
            model_a,
            metadata,
            audio,
            _DEVICE,
            return_char_alignments=False,
        )
        raw_words = _words_from_aligned(aligned if isinstance(aligned, dict) else {})
        words = postprocess_aligned_words(raw_words, duration)
        if not words:
            raise HTTPException(
                status_code=422,
                detail="WhisperX returned no word timestamps for this audio/text pair.",
            )
        return JSONResponse(
            {
                "words": words,
                "language": (language or "en").strip() or "en",
                "alignStrategy": "single_or_proportional_v2",
                "segmentCount": len(segments),
                "durationSec": duration,
            }
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"WhisperX align failed: {exc}") from exc
    finally:
        if tmp_path:
            try:
                Path(tmp_path).unlink(missing_ok=True)
            except OSError:
                pass


if __name__ == "__main__":
    import uvicorn

    host = (os.environ.get("HOST") or "127.0.0.1").strip() or "127.0.0.1"
    port = _port_from_env()
    uvicorn.run("server:app", host=host, port=port, reload=False)
