import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import { coachStepsForRole, missionTitleForRole, type CoachStep } from './copy';
import {
  isSpeechSupported,
  readVoicePreference,
  speakIndonesian,
  upsertMissionProgress,
  writeVoicePreference,
  type SpeakHandle
} from './speech';
import type { DemoRole } from './world';
import { useDemoWorld } from './world-context';
import { labGo, roleHomePath, roleScreenPath } from './lab-nav';

type Rect = { top: number; left: number; width: number; height: number };

const SEEN_PREF_PREFIX = 'lab-belajar-coach-seen-';
const MIN_AUTO_MS = 5000;
const MAX_AUTO_MS = 20000;

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

function isNavSelector(selector?: string) {
  return Boolean(selector && (selector.includes('nav-') || selector.includes('sidebar') || selector.includes('role-switch')));
}

function clampAutoMs(ms?: number) {
  const value = ms ?? 7000;
  return Math.min(MAX_AUTO_MS, Math.max(MIN_AUTO_MS, value));
}

function speechText(step: CoachStep) {
  return step.voice || `${step.title}. ${step.body}`;
}

function clampStepIndex(index: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(index, total - 1));
}

export function DemoCoach({
  role,
  presentMode,
  forceOpenKey = 0,
  onRequestSidebar
}: {
  role: DemoRole;
  presentMode: boolean;
  forceOpenKey?: number;
  onRequestSidebar?: (open: boolean) => void;
}) {
  const { lastActionType, actionSeq, clearLastEvent } = useDemoWorld();
  const steps = useMemo(() => coachStepsForRole(role), [role]);
  const missionTitle = useMemo(() => missionTitleForRole(role), [role]);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(true);
  const [voice, setVoice] = useState(() => readVoicePreference(true));
  const [rect, setRect] = useState<Rect | null>(null);
  const [waitingAction, setWaitingAction] = useState(false);
  const speakRef = useRef<SpeakHandle | null>(null);
  const navigatedStepRef = useRef<string | null>(null);
  const stepGenRef = useRef(0);
  const waitBaselineSeqRef = useRef(0);

  const safeStep = clampStepIndex(step, steps.length);
  const current: CoachStep = steps[safeStep] || steps[0];
  const voiceOk = isSpeechSupported();
  const progressPct = steps.length ? Math.round(((safeStep + 1) / steps.length) * 100) : 0;
  const atLastStep = safeStep >= Math.max(0, steps.length - 1);

  function dismissImpact() {
    clearLastEvent();
  }

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
    navigatedStepRef.current = null;
  }, [role, presentMode, forceOpenKey]);

  useEffect(() => {
    if (!open || !current) return;
    upsertMissionProgress(role, {
      stepIndex: safeStep,
      stepId: current.id,
      ...(current.completeMission ? { completedAt: new Date().toISOString() } : {})
    });
  }, [open, role, safeStep, current]);

  useEffect(() => {
    if (!open || !current?.goToScreen) return;
    const key = `${role}:${current.id}:${current.goToScreen}`;
    if (navigatedStepRef.current === key) return;
    navigatedStepRef.current = key;
    labGo(roleScreenPath(role, current.goToScreen));
  }, [open, role, current?.id, current?.goToScreen]);

  useEffect(() => {
    if (!open) return undefined;
    const mobile = window.innerWidth <= 768;
    if (mobile && isNavSelector(current?.target)) {
      onRequestSidebar?.(true);
    }
    const update = () => {
      const next = measure(current?.target);
      setRect(next);
      if (next && current?.target) {
        const el = document.querySelector(current.target) as HTMLElement | null;
        el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }
    };
    update();
    const t = window.setInterval(update, 400);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, current?.target, safeStep, onRequestSidebar]);

  useEffect(() => {
    if (!open || !current?.waitForAction) {
      setWaitingAction(false);
      return;
    }
    // Capture action sequence when this wait-step becomes active so older actions don't auto-pass.
    waitBaselineSeqRef.current = actionSeq;
    setWaitingAction(true);
  }, [open, safeStep, current?.id, current?.waitForAction]);

  useEffect(() => {
    if (!open || !current?.waitForAction) {
      setWaitingAction(false);
      return;
    }
    const needed = Array.isArray(current.waitForAction) ? current.waitForAction : [current.waitForAction];
    const fresh = actionSeq > waitBaselineSeqRef.current;
    const matched = Boolean(fresh && lastActionType && needed.includes(lastActionType));
    // Stay on the wait step after match so the user can read impact, then press Lanjut.
    setWaitingAction(!matched);
  }, [open, current?.waitForAction, lastActionType, actionSeq]);

  useEffect(() => {
    if (!open || !current) return undefined;
    speakRef.current?.cancel();
    speakRef.current = null;
    if (!voice || !voiceOk) return undefined;

    const gen = ++stepGenRef.current;
    const handle = speakIndonesian({
      text: speechText(current),
      rate: 0.96,
      onEnd: () => {
        if (gen !== stepGenRef.current) return;
        if (!auto || current.waitForAction || current.autoAdvance === false) return;
        if (current.autoAdvance === 'ms') return;
        setStep((s) => {
          const clamped = clampStepIndex(s, steps.length);
          if (clamped >= steps.length - 1) {
            setAuto(false);
            return clamped;
          }
          return clamped + 1;
        });
      }
    });
    speakRef.current = handle;
    return () => {
      handle.cancel();
      if (speakRef.current === handle) speakRef.current = null;
    };
  }, [open, voice, voiceOk, current, safeStep, auto, steps.length]);

  useEffect(() => {
    if (!open || !auto || !current) return undefined;
    if (current.waitForAction) return undefined;
    if (current.autoAdvance === false) return undefined;
    const voiceDriven = voice && voiceOk && current.autoAdvance !== 'ms';
    if (voiceDriven) return undefined;

    const ms = clampAutoMs(current.autoMs);
    const timer = window.setTimeout(() => {
      setStep((s) => {
        const clamped = clampStepIndex(s, steps.length);
        if (clamped >= steps.length - 1) {
          setAuto(false);
          return clamped;
        }
        return clamped + 1;
      });
    }, ms);
    return () => window.clearTimeout(timer);
  }, [open, auto, safeStep, current, voice, voiceOk, steps.length]);

  function close() {
    speakRef.current?.cancel();
    dismissImpact();
    setOpen(false);
    setAuto(false);
    try {
      localStorage.setItem(SEEN_PREF_PREFIX + role, '1');
    } catch {
      // ignore
    }
    if (current?.completeMission) {
      upsertMissionProgress(role, {
        stepIndex: Math.max(0, steps.length - 1),
        stepId: current.id,
        completedAt: new Date().toISOString()
      });
    }
  }

  function toggleVoice() {
    const next = !voice;
    setVoice(next);
    writeVoicePreference(next);
    if (!next) speakRef.current?.cancel();
  }

  function goNext() {
    dismissImpact();
    if (atLastStep) {
      close();
      return;
    }
    setStep((s) => clampStepIndex(s + 1, steps.length));
  }

  function goPrev() {
    dismissImpact();
    setStep((s) => clampStepIndex(s - 1, steps.length));
  }

  function restart() {
    dismissImpact();
    setStep(0);
    setAuto(true);
    navigatedStepRef.current = null;
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn sm belajar-coach-reopen"
        data-demo="coach-reopen"
        onClick={() => {
          setStep(0);
          setOpen(true);
          setAuto(true);
        }}
      >
        <Play size={14} /> Mulai tutorial
      </button>
    );
  }

  return (
    <div className={`belajar-coach-layer${rect ? ' has-target' : ''}`} data-tutorial-dialog="true" data-demo="coach">
      {rect && <div className="belajar-spotlight tour-spotlight" style={spotlightStyle(rect)} aria-hidden="true" />}
      <div className="belajar-coach-card" role="dialog" aria-label="Tutorial lab" aria-live="polite">
        <div className="belajar-coach-tools">
          <span className="pill" data-demo="coach-step-pill">
            {safeStep + 1}/{steps.length}
          </span>
          {voiceOk && (
            <button
              type="button"
              className="btn icon ghost"
              aria-label={voice ? 'Matikan suara' : 'Nyalakan suara'}
              aria-pressed={voice}
              onClick={toggleVoice}
            >
              {voice ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
          )}
          <button type="button" className="btn icon ghost" aria-label="Tutup tutorial" onClick={close}>
            <X size={16} />
          </button>
        </div>
        <div className="belajar-mission-meta">
          <small>Misi · {missionTitle}</small>
          <div className="belajar-mission-bar" aria-hidden="true">
            <span style={{ width: `${progressPct}%` }} />
          </div>
        </div>
        <h3>{current.title}</h3>
        <p>{current.body}</p>
        <p className="belajar-analogy">{current.analogy}</p>
        {waitingAction && (
          <p className="belajar-wait-hint" data-demo="wait-action">
            Menunggu aksi wajib di halaman… tekan tombol yang disorot. Jika sudah dilakukan sebelumnya, tekan Lewati.
          </p>
        )}
        {current.hintRoleJump && (
          <button
            type="button"
            className="btn sm ghost belajar-role-jump"
            onClick={() => labGo(roleHomePath(current.hintRoleJump!))}
          >
            Lihat sebagai {current.hintRoleJump}
          </button>
        )}
        {!voiceOk && (
          <p className="muted belajar-voice-fallback">Peramban ini tidak mendukung suara sistem. Ikuti teks panduan.</p>
        )}
        <div className="belajar-coach-actions">
          <button type="button" className="btn sm ghost" onClick={goPrev} disabled={safeStep === 0}>
            <ChevronLeft size={14} /> Mundur
          </button>
          <button type="button" className="btn sm ghost" onClick={() => setAuto((v) => !v)}>
            {auto ? (
              <>
                <Pause size={14} /> Jeda
              </>
            ) : (
              <>
                <Play size={14} /> Auto
              </>
            )}
          </button>
          <button type="button" className="btn sm ghost" onClick={restart}>
            <RotateCcw size={14} /> Ulangi
          </button>
          {!atLastStep ? (
            <button type="button" className="btn sm primary" onClick={goNext}>
              {waitingAction ? (
                <>
                  Lewati <ChevronRight size={14} />
                </>
              ) : (
                <>
                  Lanjut <ChevronRight size={14} />
                </>
              )}
            </button>
          ) : (
            <button type="button" className="btn sm primary" onClick={close}>
              Selesai
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
