import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import { coachStepsForRole, type CoachStep } from './copy';
import type { DemoRole } from './world';

type Rect = { top: number; left: number; width: number; height: number };

function spotlightStyle(rect: Rect): CSSProperties {
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

function measure(selector?: string): Rect | null {
  if (!selector) return null;
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return { top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 };
}

const VOICE_PREF = 'lab-belajar-voice-pref';
const SEEN_PREF_PREFIX = 'lab-belajar-coach-seen-';

function readVoice() {
  try {
    return localStorage.getItem(VOICE_PREF) !== 'off';
  } catch {
    return true;
  }
}

export function DemoCoach({
  role,
  presentMode,
  forceOpenKey = 0
}: {
  role: DemoRole;
  presentMode: boolean;
  forceOpenKey?: number;
}) {
  const steps = useMemo(() => coachStepsForRole(role), [role]);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(true);
  const [voice, setVoice] = useState(readVoice);
  const [rect, setRect] = useState<Rect | null>(null);
  const current: CoachStep = steps[Math.min(step, steps.length - 1)];
  const voiceOk = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    let should = presentMode;
    try {
      should = presentMode || localStorage.getItem(SEEN_PREF_PREFIX + role) !== '1';
    } catch {
      should = true;
    }
    setStep(0);
    setOpen(should);
    setAuto(true);
  }, [role, presentMode, forceOpenKey]);

  useEffect(() => {
    if (!open) return undefined;
    const update = () => setRect(measure(current.target));
    update();
    const t = window.setInterval(update, 400);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, current.target, step]);

  useEffect(() => {
    if (!open || !auto) return undefined;
    const ms = current.autoMs ?? 6000;
    const timer = window.setTimeout(() => {
      setStep((s) => {
        if (s >= steps.length - 1) {
          setAuto(false);
          return s;
        }
        return s + 1;
      });
    }, ms);
    return () => window.clearTimeout(timer);
  }, [open, auto, step, current.autoMs, steps.length]);

  useEffect(() => {
    if (!open || !voice || !voiceOk) return undefined;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(`${current.title}. ${current.voice || current.body}. ${current.analogy}`);
    u.lang = 'id-ID';
    u.rate = 0.96;
    const idVoice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('id'));
    if (idVoice) u.voice = idVoice;
    synth.speak(u);
    return () => synth.cancel();
  }, [open, voice, voiceOk, current, step]);

  function close() {
    setOpen(false);
    setAuto(false);
    try {
      localStorage.setItem(SEEN_PREF_PREFIX + role, '1');
    } catch {
      // ignore
    }
  }

  function toggleVoice() {
    const next = !voice;
    setVoice(next);
    try {
      localStorage.setItem(VOICE_PREF, next ? 'on' : 'off');
    } catch {
      // ignore
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn sm belajar-coach-reopen" data-demo="coach-reopen" onClick={() => { setStep(0); setOpen(true); setAuto(true); }}>
        <Play size={14} /> Mulai tutorial
      </button>
    );
  }

  return (
    <div className={`belajar-coach-layer${rect ? ' has-target' : ''}`} data-tutorial-dialog="true" data-demo="coach">
      {rect && <div className="belajar-spotlight tour-spotlight" style={spotlightStyle(rect)} aria-hidden="true" />}
      <div className="belajar-coach-card" role="dialog" aria-label="Tutorial lab">
        <div className="belajar-coach-tools">
          <span className="pill">{step + 1}/{steps.length}</span>
          {voiceOk && (
            <button type="button" className="btn icon ghost" aria-label={voice ? 'Matikan suara' : 'Nyalakan suara'} onClick={toggleVoice}>
              {voice ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
          )}
          <button type="button" className="btn icon ghost" aria-label="Tutup tutorial" onClick={close}><X size={16} /></button>
        </div>
        <h3>{current.title}</h3>
        <p>{current.body}</p>
        <p className="belajar-analogy">{current.analogy}</p>
        <div className="belajar-coach-actions">
          <button type="button" className="btn sm ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft size={14} /> Mundur
          </button>
          <button type="button" className="btn sm ghost" onClick={() => setAuto((v) => !v)}>
            {auto ? <><Pause size={14} /> Jeda</> : <><Play size={14} /> Auto</>}
          </button>
          <button type="button" className="btn sm ghost" onClick={() => { setStep(0); setAuto(true); }}>
            <RotateCcw size={14} /> Ulangi
          </button>
          {step < steps.length - 1 ? (
            <button type="button" className="btn sm primary" onClick={() => setStep((s) => s + 1)}>
              Lanjut <ChevronRight size={14} />
            </button>
          ) : (
            <button type="button" className="btn sm primary" onClick={close}>Selesai</button>
          )}
        </div>
      </div>
    </div>
  );
}
