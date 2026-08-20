# Pulse Lens — Camera Physiological & Emotion Monitor MVP

A mobile-first, browser-only research demo that samples forehead RGB values from the front camera, derives an experimental rPPG waveform with a POS-inspired transform, estimates heart rate, and aggregates results into 30-second windows.

## Run locally

```bash
npm install
npm run dev
```

Open the local HTTPS-capable preview, allow camera access, place your face inside the guide, and remain still in even light. Use **Export CSV** after at least one 30-second window. Debug mode exposes FPS, sample count, waveform, dominant frequency, estimated pulse interval, and signal quality.

## How it works

1. Camera frames remain in the browser and are never uploaded.
2. A forehead ROI is sampled at approximately 15 Hz and converted to mean RGB time series.
3. A POS-inspired chrominance projection, moving detrend, smoothing, and 0.7–3.0 Hz spectral search produce a candidate pulse frequency.
4. A conservative signal-quality gate suppresses HR and physiological arousal when the signal is poor.
5. Every 30 seconds, measurements are saved in memory and made available as CSV.

The **Physiological Arousal Index** is an experimental, transparent heuristic derived from deviation of estimated HR from a nominal resting midpoint. It is not a stress score and is suppressed when signal quality is poor. A future version can replace this with a personal 60-second baseline and validated beat-interval features.

Facial valence/arousal are deliberately shown as **Experimental / unavailable**. No trustworthy expression model is bundled in this MVP, so the interface never substitutes random or fixed values. A future on-device model may map emotion probabilities to valence/arousal; any mapping must be documented and validated before use.

## GitHub Pages

The Pages workflow builds a static export on every push to `main`. In repository settings, choose **GitHub Actions** as the Pages source. Camera access requires HTTPS, which GitHub Pages provides.

## Privacy

Video is processed locally. Raw frames and video are not saved or uploaded. Only aggregated numeric windows exist in memory until the tab is closed or the user exports a CSV.

## Limitations

- Experimental research/education demo; not a medical or diagnostic device.
- rPPG is highly sensitive to illumination, shadows, motion, face position, skin visibility, camera quality, compression, auto-exposure, and frame rate.
- The MVP uses a stable central face guide rather than a production facial-landmark model; it requires careful positioning.
- A 30-second window is too short for reliable frequency-domain HRV, so LF/HF is not reported.
- HR and the arousal index may be inaccurate even when a value is shown.
- Physiological arousal is not equivalent to psychological stress or any clinical condition.
- Facial expression cannot determine internal emotion. Facial valence/arousal are unavailable in this version.
- Browser backgrounding and thermal throttling can interrupt sampling.

## Current status / roadmap

Implemented: front-camera capture, visible face/forehead guides, local RGB sampling, POS-inspired rPPG, conservative HR gating, signal quality, experimental arousal index, 30-second aggregation, timeline, CSV export, responsive UI, and research debug mode.

Planned: real on-device face landmarks, multi-ROI fusion (forehead and cheeks), improved filters and motion rejection, validated signal-quality metrics, personal baseline calibration, and a documented on-device facial-expression model.

## Disclaimer

**Experimental research/education demo. Not a medical or diagnostic device.** Do not use it for diagnosis, treatment, safety decisions, or assessment of another person's emotions.
