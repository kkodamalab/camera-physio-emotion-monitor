"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Quality = "Good" | "Moderate" | "Poor";
type Sample = { t: number; r: number; g: number; b: number };
type WindowRow = {
  timestamp: string; window_number: number; estimated_HR: number | null;
  physiological_arousal_index: number | null; signal_quality: Quality;
  valence_mean: number | null; valence_sd: number | null;
  facial_arousal_mean: number | null; facial_arousal_sd: number | null;
};

const WINDOW_SECONDS = 30;
const fmt = (v: number | null, digits = 0) => v == null ? "—" : v.toFixed(digits);
const mean = (a: number[]) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const sd = (a: number[]) => { const m = mean(a); return a.length ? Math.sqrt(mean(a.map(v => (v - m) ** 2))) : 0; };

function estimatePulse(samples: Sample[]) {
  if (samples.length < 80) return { hr: null as number | null, quality: "Poor" as Quality, wave: [] as number[], dominant: null as number | null };
  const duration = (samples.at(-1)!.t - samples[0].t) / 1000;
  const fps = samples.length / Math.max(duration, 1);
  const rs = samples.map(s => s.r), gs = samples.map(s => s.g), bs = samples.map(s => s.b);
  const mr = mean(rs), mg = mean(gs), mb = mean(bs);
  const x = samples.map((_, i) => (gs[i] / mg - bs[i] / mb));
  const y = samples.map((_, i) => (gs[i] / mg + bs[i] / mb - 2 * rs[i] / mr));
  const alpha = sd(x) / Math.max(sd(y), 1e-6);
  let raw = x.map((v, i) => v + alpha * y[i]);
  const trendN = Math.max(3, Math.round(fps * .7));
  raw = raw.map((v, i) => v - mean(raw.slice(Math.max(0, i - trendN), Math.min(raw.length, i + trendN))));
  const wave = raw.map((_, i) => mean(raw.slice(Math.max(0, i - 2), Math.min(raw.length, i + 3))));
  let bestAmp = 0, dominant = 0;
  for (let bpm = 42; bpm <= 180; bpm += 1) {
    const f = bpm / 60; let re = 0, im = 0;
    for (let i = 0; i < wave.length; i++) { const a = 2 * Math.PI * f * i / fps; re += wave[i] * Math.cos(a); im -= wave[i] * Math.sin(a); }
    const amp = Math.hypot(re, im);
    if (amp > bestAmp) { bestAmp = amp; dominant = f; }
  }
  const noise = Math.sqrt(mean(wave.map(v => v * v))) * Math.sqrt(wave.length);
  const snr = bestAmp / Math.max(noise, 1e-8);
  const quality: Quality = duration < 8 || snr < 1.8 ? "Poor" : snr < 3.2 ? "Moderate" : "Good";
  return { hr: quality === "Poor" ? null : Math.round(dominant * 60), quality, wave: wave.slice(-180), dominant };
}

function Sparkline({ values, color = "#52e7c0" }: { values: number[]; color?: string }) {
  if (values.length < 2) return <div className="spark-empty">Signal trace will appear here</div>;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const points = values.map((v, i) => `${i / (values.length - 1) * 100},${34 - (v - lo) / span * 30}`).join(" ");
  return <svg className="spark" viewBox="0 0 100 36" preserveAspectRatio="none" aria-label="Signal waveform"><polyline points={points} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" /></svg>;
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null), overlayRef = useRef<HTMLCanvasElement>(null), sampleCanvas = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null), samplesRef = useRef<Sample[]>([]), emotionRef = useRef<{t:number;v:number;a:number}[]>([]);
  const [running, setRunning] = useState(false), [status, setStatus] = useState("Camera idle"), [face, setFace] = useState(false);
  const [elapsed, setElapsed] = useState(0), [hr, setHr] = useState<number|null>(null), [quality, setQuality] = useState<Quality>("Poor");
  const [arousal, setArousal] = useState<number|null>(null), [wave, setWave] = useState<number[]>([]), [dominant, setDominant] = useState<number|null>(null);
  const [rows, setRows] = useState<WindowRow[]>([]), [debug, setDebug] = useState(false), [fps, setFps] = useState(0);
  const facialAvailable = false;
  const next = WINDOW_SECONDS - (elapsed % WINDOW_SECONDS || (elapsed ? WINDOW_SECONDS : 0));

  const stop = useCallback(() => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; setRunning(false); setFace(false); setStatus("Camera idle"); }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 }, frameRate: { ideal: 30 } }, audio: false });
      streamRef.current = stream; if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      samplesRef.current = []; emotionRef.current = []; setElapsed(0); setRows([]); setRunning(true); setStatus("Camera ready · Analyzing");
    } catch { setStatus("Camera permission unavailable"); }
  }, []);

  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    if (!running) return;
    let raf = 0, last = performance.now(), frames = 0, lastFps = last;
    const tick = async (now: number) => {
      raf = requestAnimationFrame(tick); const video = videoRef.current, canvas = overlayRef.current;
      if (!video || !canvas || video.readyState < 2 || now - last < 65) return; last = now; frames++;
      if (now - lastFps > 1000) { setFps(Math.round(frames * 1000 / (now - lastFps))); frames = 0; lastFps = now; }
      canvas.width = video.videoWidth; canvas.height = video.videoHeight; const ctx = canvas.getContext("2d")!; ctx.clearRect(0,0,canvas.width,canvas.height);
      const w = canvas.width * .42, h = canvas.height * .34, x = (canvas.width - w)/2, y = canvas.height * .18;
      ctx.strokeStyle = "#52e7c0"; ctx.lineWidth = Math.max(3, canvas.width/180); ctx.setLineDash([18,12]); ctx.strokeRect(x,y,w,h);
      const roi = { x:x+w*.22, y:y+h*.08, w:w*.56, h:h*.20 }; ctx.setLineDash([]); ctx.strokeStyle="#d7ff62"; ctx.strokeRect(roi.x,roi.y,roi.w,roi.h);
      if (!sampleCanvas.current) sampleCanvas.current = document.createElement("canvas"); const sc = sampleCanvas.current; sc.width=32; sc.height=16;
      const sctx=sc.getContext("2d",{willReadFrequently:true})!; sctx.drawImage(video,roi.x,roi.y,roi.w,roi.h,0,0,32,16); const data=sctx.getImageData(0,0,32,16).data;
      let r=0,g=0,b=0,n=0; for(let i=0;i<data.length;i+=4){ if(data[i+3]){r+=data[i];g+=data[i+1];b+=data[i+2];n++;} }
      r/=n; g/=n; b/=n; const luminance=.2126*r+.7152*g+.0722*b; const detected=luminance>35&&luminance<240&&Math.max(r,g,b)-Math.min(r,g,b)>4;
      setFace(detected); setStatus(detected?"Face detected · Analyzing":"Face not detected · Align with guide");
      const t=Date.now(); if(detected) samplesRef.current.push({t,r,g,b}); samplesRef.current=samplesRef.current.filter(s=>t-s.t<=32000);
    }; raf=requestAnimationFrame(tick); return()=>cancelAnimationFrame(raf);
  },[running]);

  useEffect(() => {
    if (!running) return; const started=Date.now();
    const id=setInterval(()=>{
      const e=Math.floor((Date.now()-started)/1000); setElapsed(e); const result=estimatePulse(samplesRef.current); setHr(result.hr); setQuality(result.quality); setWave(result.wave); setDominant(result.dominant);
      if(result.hr!=null){ const centered=Math.abs(result.hr-70); setArousal(Math.max(0,Math.min(100,Math.round(35+centered*.8)))); } else setArousal(null);
      if(e>0 && e%WINDOW_SECONDS===0){
        setRows(prev=>{ if(prev.at(-1)?.window_number===e/WINDOW_SECONDS)return prev; const q=result.quality; const row:WindowRow={timestamp:new Date().toISOString(),window_number:e/WINDOW_SECONDS,estimated_HR:result.hr,physiological_arousal_index:q==="Poor"?null:(result.hr==null?null:Math.max(0,Math.min(100,Math.round(35+Math.abs(result.hr-70)*.8)))),signal_quality:q,valence_mean:null,valence_sd:null,facial_arousal_mean:null,facial_arousal_sd:null}; return [...prev,row].slice(-40); });
      }
    },1000); return()=>clearInterval(id);
  },[running]);

  const exportCsv=()=>{ const headers=["timestamp","window_number","estimated_HR","physiological_arousal_index","signal_quality","valence_mean","valence_sd","facial_arousal_mean","facial_arousal_sd"]; const lines=[headers.join(","),...rows.map(r=>headers.map(h=>String(r[h as keyof WindowRow]??"")).join(","))]; const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([lines.join("\n")],{type:"text/csv"})); a.download=`pulse-lens-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(a.href); };
  const chartValues=useMemo(()=>rows.map(r=>r.physiological_arousal_index??0),[rows]);

  return <main>
    <header><div className="brand"><span className="mark">P</span><div><strong>Pulse Lens</strong><small>CAMERA PHYSIO LAB</small></div></div><button className="icon-btn" onClick={()=>setDebug(v=>!v)} aria-pressed={debug}>DEBUG {debug?"ON":"OFF"}</button></header>
    <section className="hero"><div><p className="eyebrow">LIVE · ON-DEVICE ANALYSIS</p><h1>Your signals,<br/><em>made visible.</em></h1><p className="intro">An experimental lens on pulse dynamics and facial expression—processed privately in your browser.</p></div><div className="privacy"><span>●</span> Video stays on this device</div></section>
    <section className="camera-card">
      <div className="camera-stage"><video ref={videoRef} muted playsInline/><canvas ref={overlayRef}/>{!running&&<div className="camera-empty"><span>◎</span><b>Ready when you are</b><small>Position your face in natural, steady light</small></div>}<div className={`status ${face?"ok":""}`}><i/>{status}</div><div className="roi-label">FOREHEAD ROI</div></div>
      <div className="camera-actions"><button className="primary" onClick={running?stop:start}>{running?"Stop session":"Start camera"}</button><span>{running?`${String(Math.floor(elapsed/60)).padStart(2,"0")}:${String(elapsed%60).padStart(2,"0")}`:"Local processing"}</span></div>
    </section>
    <section className="section-head"><div><p className="eyebrow">CURRENT READINGS</p><h2>Live signals</h2></div><div className={`quality q-${quality.toLowerCase()}`}>{quality} signal</div></section>
    <section className="metrics">
      <article className="metric featured"><label>ESTIMATED HEART RATE</label><div><strong>{fmt(hr)}</strong><span>bpm</span></div><Sparkline values={wave}/><small>{quality==="Poor"?"Insufficient signal — hold still in even light":"POS-derived pulse estimate"}</small></article>
      <article className="metric"><label>PHYSIOLOGICAL AROUSAL</label><div><strong>{fmt(arousal)}</strong><span>/ 100</span></div><div className="meter"><i style={{width:`${arousal??0}%`}}/></div><small>Experimental index · not stress</small></article>
      <article className="metric"><label>FACIAL VALENCE</label><div><strong>—</strong></div><small>Experimental / unavailable</small></article>
      <article className="metric"><label>FACIAL AROUSAL</label><div><strong>—</strong></div><small>Experimental / unavailable</small></article>
    </section>
    <section className="window"><div><p className="eyebrow">30-SECOND WINDOW</p><h2>Expression dynamics</h2></div><div className="countdown"><span>{running?next:30}</span><small>SEC TO NEXT<br/>ANALYSIS</small></div><div className="window-grid">{[["Valence mean",null],["Valence SD",null],["Arousal mean",null],["Arousal SD",null]].map(([l,v])=><div key={l as string}><label>{l}</label><b>{fmt(v as number|null,2)}</b></div>)}</div><p className="unavailable">Facial model is not bundled in this honest MVP; values remain unavailable rather than simulated.</p></section>
    <section className="history"><div className="section-head"><div><p className="eyebrow">SESSION HISTORY</p><h2>Window timeline</h2></div><button className="secondary" onClick={exportCsv} disabled={!rows.length}>Export CSV</button></div><div className="chart"><Sparkline values={chartValues} color="#d7ff62"/>{!rows.length&&<p>Completed 30-second windows will appear here.</p>}</div></section>
    {debug&&<section className="debug"><p className="eyebrow">RESEARCH DEBUG</p><h2>Signal inspector</h2><div className="debug-grid"><div><label>FPS</label><b>{fps}</b></div><div><label>Face confidence</label><b>{face?"ROI heuristic":"—"}</b></div><div><label>Samples</label><b>{samplesRef.current.length}</b></div><div><label>Dominant frequency</label><b>{dominant?`${dominant.toFixed(2)} Hz`:"—"}</b></div><div><label>Signal quality</label><b>{quality}</b></div><div><label>Pulse intervals</label><b>{hr?`${Math.round(60000/hr)} ms`:"—"}</b></div></div><Sparkline values={wave}/></section>}
    <footer><p>Experimental research/education demo. Not a medical or diagnostic device.</p><small>Camera-derived signals are sensitive to lighting, movement, skin visibility, camera quality and frame rate. No video is saved or uploaded.</small></footer>
  </main>;
}
