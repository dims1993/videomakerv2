# Freesound music beds

Pixabay’s public API covers **images and videos only** — not music.
This folder is used for:

1. **API cache** — `cache/<presetId>-<soundId>.mp3` previews downloaded via Freesound
2. **Optional local overrides** — drop `soft-begin.mp3`, `soft-fade.mp3`, or `outro-soft.mp3` here to skip the API for that preset

## Setup

1. Create an API key at https://freesound.org/apiv2/apply
2. Add to `.env`:

```bash
FREESOUND_API_KEY="your_key"
```

3. In Voiceover → By Scene, open **Freesound music beds** and Attach / Attach suggested beds.

Preview MP3s work with token auth (no OAuth). Always check the track’s Creative Commons license and credit the author when required.
