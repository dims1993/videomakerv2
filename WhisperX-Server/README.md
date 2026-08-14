# WhisperX forced-alignment server

Local HTTP wrapper used by VideoMaker subtitle alignment (`WHISPERX_BASE_URL`).

## Endpoints

- `GET /health` → `{ "ok": true, "alignStrategy": "single_or_proportional_v2", ... }`
- `POST /align` multipart: `file`, `text`, `language` → `{ "words": [{ "word", "start", "end" }, ...], "alignStrategy": "..." }`

## Alignment strategy (v2)

1. **Short/medium clips** (default scene VO): one segment covering `0 → duration` with the full known text. Avoids the old equal-time sentence windows that caused slips.
2. **Long clips**: sentence split with **time proportional to word count** (not equal slices).
3. **Post-process**: clamp to duration, enforce monotonic non-overlapping words, expand tiny words (`WHISPERX_MIN_WORD_DUR_SEC`, default `0.05`).

Optional env knobs:

- `WHISPERX_SINGLE_SEGMENT_MAX_SEC` (default `45`)
- `WHISPERX_SINGLE_SEGMENT_MAX_WORDS` (default `90`)
- `WHISPERX_MIN_WORD_DUR_SEC` (default `0.05`)
- `WHISPERX_DEVICE` (`cpu` / `cuda` / `mps`)

## One-time setup

```bash
cd WhisperX-Server
uv venv venv --python 3.11
uv pip install -r requirements.txt --python ./venv/bin/python
```

On Apple Silicon, if torch wheels fail, install a CPU torch build first, then re-run the requirements install.

## Run (or use VideoMaker Start server)

```bash
cd WhisperX-Server
./venv/bin/python server.py
```

Default: `http://127.0.0.1:8011` (override with `WHISPERX_BASE_URL` / `PORT`).

After pulling align-strategy changes, **restart** the WhisperX process (Stop/Start in the UI or kill the PID under `storage/whisperx-server.pid`).

## Helper tests (no model download)

```bash
cd WhisperX-Server
./venv/bin/python -m unittest test_align_helpers.py
```
