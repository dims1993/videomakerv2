# Local rendering

Render Draft uses FFmpeg.

For basic image and audio rendering:

```bash
brew install ffmpeg
```

For burned active-word ASS captions, use an FFmpeg build with libass:

```bash
brew install ffmpeg-full
ffmpeg-full -filters | grep ass
FFMPEG_PATH="$(which ffmpeg-full)" npm run dev
```

If the default Homebrew FFmpeg does not include the `ass` filter, captions cannot be burned. You can still render without captions by disabling **Burn captions** in the Render Draft tab.
