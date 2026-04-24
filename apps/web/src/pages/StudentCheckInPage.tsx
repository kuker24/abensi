import { CheckCircle2, ChevronLeft, ChevronRight, MapPinned, ShieldCheck } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import { listClassSessions } from '../lib/api';
import {
  defaultCheckInDraftState,
  flowStepFromIndex,
  simulateAsyncTransition
} from '../lib/experienceState';
import { formatDateTime, formatTime, toIsoDateLocal } from '../lib/format';
import { labelForStatus } from '../lib/uiLabels';
import type { SessionItem } from '../types/domain';
import type { CheckInDraftState, MockSessionState, ValidationMap } from '../types/experience';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  Stepper,
  Textarea,
  useToast
} from '../components/ui';

const statusOptions = [
  { label: 'Pilih status kehadiran', value: '' },
  { label: 'Hadir', value: 'HADIR' },
  { label: 'Terlambat', value: 'TELAT' },
  { label: 'Izin', value: 'IZIN' },
  { label: 'Sakit', value: 'SAKIT' }
];

function buildFallbackSessions(): SessionItem[] {
  const base = new Date();
  const startA = new Date(base);
  startA.setHours(7, 30, 0, 0);
  const endA = new Date(base);
  endA.setHours(8, 50, 0, 0);

  const startB = new Date(base);
  startB.setHours(10, 5, 0, 0);
  const endB = new Date(base);
  endB.setHours(11, 25, 0, 0);

  return [
    {
      id: 'mock-session-1',
      startsAt: startA.toISOString(),
      endsAt: endA.toISOString(),
      status: 'OPEN',
      schoolClass: { id: '10a', code: 'X-A', name: 'X-A', yearLabel: '2025/2026' },
      subject: { id: 'math', code: 'MAT', name: 'Matematika' },
      teacher: { id: 'guru-a', username: 'guru.math', fullName: 'Bu Siti Rahma', role: 'GURU_MAPEL' }
    },
    {
      id: 'mock-session-2',
      startsAt: startB.toISOString(),
      endsAt: endB.toISOString(),
      status: 'SCHEDULED',
      schoolClass: { id: '10a', code: 'X-A', name: 'X-A', yearLabel: '2025/2026' },
      subject: { id: 'fisika', code: 'FIS', name: 'Fisika' },
      teacher: { id: 'guru-b', username: 'guru.fis', fullName: 'Pak Andi Pratama', role: 'GURU_MAPEL' }
    }
  ];
}

function validateFlow(flow: CheckInDraftState): ValidationMap {
  const errors: ValidationMap = {};
  if (!flow.selectedSessionId) {
    errors.selectedSessionId = 'Pilih sesi kelas terlebih dahulu.';
  }
  if (!flow.studentName.trim() || flow.studentName.trim().length < 3) {
    errors.studentName = 'Nama minimal 3 karakter.';
  }
  if (!flow.studentId.trim() || !/^\d{4,}$/.test(flow.studentId.trim())) {
    errors.studentId = 'NIS minimal 4 digit angka.';
  }
  if (!flow.status) {
    errors.status = 'Pilih status kehadiran.';
  }
  if (!flow.agreePolicy) {
    errors.policy = 'Persetujuan kebijakan wajib dicentang.';
  }
  if (!flow.locationConfirmed) {
    errors.location = 'Konfirmasi lokasi harus diaktifkan.';
  }
  return errors;
}

export function StudentCheckInPage(props: {
  draft: CheckInDraftState;
  setDraft: Dispatch<SetStateAction<CheckInDraftState>>;
  setMockState: Dispatch<SetStateAction<MockSessionState>>;
}) {
  const { pushToast } = useToast();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationMap>({});

  const flow = props.draft;

  const steps = useMemo(
    () => [
      { value: 'session', label: 'Pilih Sesi', description: 'Tentukan kelas aktif' },
      { value: 'identity', label: 'Data Siswa', description: 'Periksa data pribadi' },
      { value: 'validation', label: 'Pengecekan', description: 'Konfirmasi persyaratan' },
      { value: 'confirm', label: 'Konfirmasi', description: 'Periksa sebelum kirim' },
      { value: 'receipt', label: 'Selesai', description: 'Bukti absensi masuk' }
    ],
    []
  );

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === flow.selectedSessionId) ?? null,
    [sessions, flow.selectedSessionId]
  );

  const summaryBadges = useMemo(() => {
    const checks = validateFlow(flow);
    const total = Object.keys(checks).length;
    if (total === 0) {
      return { tone: 'success' as const, label: 'Semua validasi lulus' };
    }
    if (total <= 2) {
      return { tone: 'warning' as const, label: `${total} item perlu perhatian` };
    }
    return { tone: 'danger' as const, label: `${total} item belum valid` };
  }, [flow]);

  function patchDraft(patch: Partial<CheckInDraftState>) {
    props.setDraft((prev) => {
      const next = {
        ...prev,
        ...patch,
        updatedAt: new Date().toISOString()
      };
      return next;
    });
  }

  function setStep(step: number) {
    patchDraft({
      step,
      flowStep: flowStepFromIndex(step)
    });
  }

  useEffect(() => {
    async function loadSessions() {
      setLoadingSessions(true);
      setSessionError(null);
      try {
        const data = await listClassSessions(toIsoDateLocal());
        const available = data.length > 0 ? data : buildFallbackSessions();
        setSessions(available);

        if (!flow.selectedSessionId && available.length > 0) {
          patchDraft({ selectedSessionId: available[0].id });
        }
      } catch {
        const fallback = buildFallbackSessions();
        setSessions(fallback);
        setSessionError('Mode simulasi aktif. Data sesi menggunakan fallback lokal.');
        if (!flow.selectedSessionId && fallback.length > 0) {
          patchDraft({ selectedSessionId: fallback[0].id });
        }
      } finally {
        setLoadingSessions(false);
      }
    }

    void loadSessions();
  }, []);

  function handleNext() {
    if (flow.step === 0 && !flow.selectedSessionId) {
      setValidation({ selectedSessionId: 'Pilih sesi sebelum lanjut.' });
      return;
    }

    if (flow.step === 1) {
      const checks = validateFlow({ ...flow, agreePolicy: true, locationConfirmed: true });
      const identityErrors: ValidationMap = {};
      if (checks.studentName) identityErrors.studentName = checks.studentName;
      if (checks.studentId) identityErrors.studentId = checks.studentId;
      if (checks.status) identityErrors.status = checks.status;
      setValidation(identityErrors);
      if (Object.keys(identityErrors).length > 0) return;
    }

    if (flow.step === 2) {
      const checks = validateFlow(flow);
      setValidation(checks);
      if (Object.keys(checks).length > 0) return;
    }

    setStep(Math.min(4, flow.step + 1));
  }

  function handleBack() {
    setStep(Math.max(0, flow.step - 1));
  }

  async function handleSubmit() {
    const checks = validateFlow(flow);
    setValidation(checks);
    if (Object.keys(checks).length > 0) {
      pushToast('Lengkapi semua pengecekan sebelum mengirim.', 'error');
      return;
    }

    patchDraft({ asyncState: 'loading' });
    try {
      await simulateAsyncTransition({ minMs: 800, maxMs: 1400, failRate: 0.08 });
      const receiptId = `CHK-${Date.now().toString().slice(-7)}`;
      const submittedAt = new Date().toISOString();

      props.setMockState((prev) => ({
        ...prev,
        teacherSessions: {
          ...prev.teacherSessions,
          [flow.selectedSessionId]: {
            phase: 'review',
            hasUnsaved: false,
            updatedAt: submittedAt
          }
        }
      }));

      props.setDraft((prev) => ({
        ...prev,
        asyncState: 'success',
        receiptId,
        submittedAt,
        step: 4,
        flowStep: 'receipt',
        updatedAt: submittedAt
      }));
      pushToast('Absen masuk berhasil direkam.', 'success');
    } catch {
      patchDraft({ asyncState: 'error' });
      pushToast('Absen masuk belum berhasil diverifikasi. Silakan kirim ulang.', 'error');
    }
  }

  function handleRestart() {
    props.setDraft((prev) => ({
      ...defaultCheckInDraftState,
      studentName: prev.studentName,
      studentId: prev.studentId,
      updatedAt: new Date().toISOString()
    }));
    setValidation({});
  }

  return (
    <div className="stack">
      <Card variant="elevated" className="hero-card">
        <h2>Alur Absen Masuk Siswa</h2>
        <p>Isi data secara bertahap agar status kehadiran Anda tercatat akurat sebelum disinkronkan ke kelas.</p>
      </Card>

      <Card className="checkin-shell">
        <div className="checkin-header">
          <Stepper
            steps={steps}
            activeValue={flow.flowStep}
            onStepSelect={(value) => {
              const idx = steps.findIndex((step) => step.value === value);
              if (idx >= 0 && idx <= flow.step) {
                setStep(idx);
              }
            }}
          />
          <Badge tone={summaryBadges.tone}>{summaryBadges.label}</Badge>
        </div>

        {sessionError ? <p className="text-error">{sessionError}</p> : null}

        <AnimatePresence mode="wait" initial={false}>
          <motion.section
            key={flow.flowStep}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            className="checkin-stage"
          >
            {flow.flowStep === 'session' ? (
              <div className="stack-sm">
                <div className="toolbar">
                  <div className="toolbar-group">
                    <label htmlFor="session-picker">Sesi aktif</label>
                    <Select
                      id="session-picker"
                      value={flow.selectedSessionId}
                      onChange={(value) => patchDraft({ selectedSessionId: value })}
                      options={
                        sessions.length > 0
                          ? sessions.map((session) => ({
                              label: `${session.schoolClass.code} · ${session.subject.name} (${formatTime(session.startsAt)})`,
                              value: session.id
                            }))
                          : [{ label: 'Belum ada sesi tersedia', value: '' }]
                      }
                      disabled={loadingSessions}
                    />
                    {validation.selectedSessionId ? <small className="text-error">{validation.selectedSessionId}</small> : null}
                  </div>
                </div>

                {selectedSession ? (
                  <Card variant="glass">
                    <h3>{selectedSession.subject.name}</h3>
                    <p>
                      {selectedSession.schoolClass.code} · {selectedSession.teacher.fullName}
                    </p>
                    <small>
                      {formatDateTime(selectedSession.startsAt)} - {formatTime(selectedSession.endsAt)} ·{' '}
                      {labelForStatus(selectedSession.status)}
                    </small>
                  </Card>
                ) : (
                  <EmptyState
                    title="Belum ada sesi dipilih"
                    description="Pilih sesi aktif untuk memulai proses check-in."
                  />
                )}
              </div>
            ) : null}

            {flow.flowStep === 'identity' ? (
              <div className="grid cols-2">
                <div className="stack-sm">
                  <label htmlFor="student-name">Nama Siswa</label>
                  <Input
                    id="student-name"
                    value={flow.studentName}
                    onChange={(value) => patchDraft({ studentName: value })}
                    placeholder="Contoh: Ahmad Fauzi"
                    error={validation.studentName}
                  />
                  {validation.studentName ? <small className="text-error">{validation.studentName}</small> : null}
                </div>

                <div className="stack-sm">
                  <label htmlFor="student-id">NIS</label>
                  <Input
                    id="student-id"
                    value={flow.studentId}
                    onChange={(value) => patchDraft({ studentId: value })}
                    placeholder="Contoh: 240132"
                    error={validation.studentId}
                  />
                  {validation.studentId ? <small className="text-error">{validation.studentId}</small> : null}
                </div>

                <div className="stack-sm">
                  <label htmlFor="status-presence">Status</label>
                  <Select
                    id="status-presence"
                    value={flow.status}
                    onChange={(value) => patchDraft({ status: value as CheckInDraftState['status'] })}
                    options={statusOptions}
                    error={validation.status}
                  />
                  {validation.status ? <small className="text-error">{validation.status}</small> : null}
                </div>

                <div className="stack-sm">
                  <label htmlFor="checkin-note">Catatan (opsional)</label>
                  <Textarea
                    id="checkin-note"
                    value={flow.note}
                    onChange={(value) => patchDraft({ note: value })}
                    rows={3}
                    placeholder="Tulis alasan bila izin/sakit."
                  />
                </div>
              </div>
            ) : null}

            {flow.flowStep === 'validation' ? (
              <div className="stack-sm">
                <Card variant="outlined">
                  <div className="validation-item">
                    <div className="validation-item-main">
                      <ShieldCheck size={16} />
                      <span>Saya menyetujui kebijakan kehadiran kelas.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={flow.agreePolicy}
                      aria-label="Setujui kebijakan kehadiran kelas"
                      onChange={(event) => patchDraft({ agreePolicy: event.target.checked })}
                    />
                  </div>
                  {validation.policy ? <small className="text-error">{validation.policy}</small> : null}
                </Card>

                <Card variant="outlined">
                  <div className="validation-item">
                    <div className="validation-item-main">
                      <MapPinned size={16} />
                      <span>Lokasi check-in sesuai area sekolah.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={flow.locationConfirmed}
                      aria-label="Konfirmasi lokasi absen sesuai area sekolah"
                      onChange={(event) => patchDraft({ locationConfirmed: event.target.checked })}
                    />
                  </div>
                  {validation.location ? <small className="text-error">{validation.location}</small> : null}
                </Card>

                <Card variant="glass">
                  <small>
                    Data tersimpan otomatis: {formatDateTime(flow.updatedAt)}. Anda dapat memuat ulang halaman tanpa
                    kehilangan progres.
                  </small>
                </Card>
              </div>
            ) : null}

            {flow.flowStep === 'confirm' ? (
              <div className="stack-sm">
                <Card variant="glass">
                  <h3>Ringkasan Pengajuan</h3>
                  <p>
                    {flow.studentName || '-'} ({flow.studentId || '-'})
                  </p>
                  <small>
                    {selectedSession
                      ? `${selectedSession.schoolClass.code} · ${selectedSession.subject.name}`
                      : 'Sesi belum dipilih'}
                  </small>
                  <div className="action-row wrap">
                    <Badge tone="info">Status: {labelForStatus(flow.status) || '-'}</Badge>
                    <Badge tone="neutral">Catatan: {flow.note.trim() ? 'Ada' : 'Tidak ada'}</Badge>
                  </div>
                </Card>

                <Card variant="outlined">
                  <small>
                    Setelah dikirim, data masuk ke antrean verifikasi kelas. Jika belum berhasil, Anda bisa kirim ulang
                    dari langkah ini.
                  </small>
                </Card>
              </div>
            ) : null}

            {flow.flowStep === 'receipt' ? (
              <div className="stack-sm">
                <Card className="checkin-receipt" variant="elevated">
                  <div className="checkin-receipt-head">
                    <CheckCircle2 size={20} />
                    <h3>Absen Masuk Berhasil</h3>
                  </div>
                  <p>Bukti absen masuk sudah tersimpan di perangkat Anda dan siap disinkronkan ke riwayat siswa.</p>
                  <div className="action-row wrap">
                    <Badge tone="success">Kode Bukti: {flow.receiptId ?? '-'}</Badge>
                    <Badge tone="info">Waktu: {flow.submittedAt ? formatDateTime(flow.submittedAt) : '-'}</Badge>
                  </div>
                </Card>

                <div className="action-row wrap">
                  <Button variant="secondary" onClick={handleRestart}>
                    Mulai Absen Baru
                  </Button>
                  <Link to="/siswa/dashboard">
                    <Button>Lihat Beranda Siswa</Button>
                  </Link>
                </div>
              </div>
            ) : null}
          </motion.section>
        </AnimatePresence>

        {flow.flowStep !== 'receipt' ? (
          <div className="checkin-actions">
            <Button variant="ghost" onClick={handleBack} disabled={flow.step === 0}>
              <ChevronLeft size={16} />
              Kembali
            </Button>

            {flow.flowStep === 'confirm' ? (
              <Button
                onClick={() => void handleSubmit()}
                loading={flow.asyncState === 'loading'}
                loadingText="Sedang memverifikasi..."
              >
                Kirim Absen Masuk
              </Button>
            ) : (
              <Button onClick={handleNext}>
                Lanjut
                <ChevronRight size={16} />
              </Button>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
