import { useEffect, useState } from 'react';
import { correctAttendance, getSessionRoster, listClassSessions } from '../lib/api';
import { toIsoDateLocal } from '../lib/format';
import { labelForStatus } from '../lib/uiLabels';
import type { StudentAttendanceStatus } from '../types/domain';
import { Button, Card, Modal, Select, Textarea, useToast } from '../components/ui';

const statusOptions: StudentAttendanceStatus[] = ['HADIR', 'TELAT', 'IZIN', 'SAKIT', 'ALPA'];

export function TeacherCorrectionPage() {
  const { pushToast } = useToast();
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [studentId, setStudentId] = useState('');
  const [status, setStatus] = useState<StudentAttendanceStatus>('HADIR');
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);

  async function loadSessions() {
    try {
      const data = await listClassSessions(toIsoDateLocal());
      const eligible = data.filter((item) => item.status !== 'SCHEDULED');
      setSessions(eligible);
      if (!sessionId && eligible[0]) {
        setSessionId(eligible[0].id);
      }
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal memuat sesi koreksi.', 'error');
    }
  }

  useEffect(() => {
    void loadSessions();
  }, []);

  useEffect(() => {
    async function loadRoster() {
      if (!sessionId) return;
      try {
        const detail = await getSessionRoster(sessionId);
        setStudents(detail.roster);
        if (!studentId && detail.roster[0]) {
          setStudentId(detail.roster[0].studentId);
        }
      } catch {
        setStudents([]);
      }
    }

    void loadRoster();
  }, [sessionId]);

  async function submitCorrection() {
    if (!sessionId || !studentId) {
      pushToast('Pilih sesi dan siswa.', 'error');
      return;
    }
    if (reason.trim().length < 10) {
      pushToast('Alasan minimal 10 karakter.', 'error');
      return;
    }

    try {
      await correctAttendance(sessionId, studentId, { status, reason: reason.trim() });
      pushToast('Koreksi berhasil disimpan.', 'success');
      setOpen(false);
      setReason('');
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal menyimpan koreksi.', 'error');
    }
  }

  return (
    <div className="stack">
      <Card variant="elevated" className="hero-card">
        <h2>Koreksi Presensi Guru</h2>
        <p>Perbaiki status presensi siswa pada sesi yang sudah berjalan.</p>
      </Card>

      <Card>
        <div className="stack-sm">
          <label>Sesi</label>
          <Select
            value={sessionId}
            onChange={setSessionId}
            options={
              sessions.length > 0
                ? sessions.map((item) => ({ label: `${item.schoolClass.code} · ${item.subject.name}`, value: item.id }))
                : [{ label: 'Tidak ada sesi', value: '' }]
            }
          />

          <label>Siswa</label>
          <Select
            value={studentId}
            onChange={setStudentId}
            options={
              students.length > 0
                ? students.map((item) => ({ label: `${item.fullName} (${labelForStatus(item.status)})`, value: item.studentId }))
                : [{ label: 'Tidak ada siswa', value: '' }]
            }
          />

          <label>Status Baru</label>
          <Select
            value={status}
            onChange={(value) => setStatus(value as StudentAttendanceStatus)}
            options={statusOptions.map((item) => ({ label: labelForStatus(item), value: item }))}
          />

          <Button onClick={() => setOpen(true)}>Ajukan Koreksi</Button>
        </div>
      </Card>

      <Modal
        open={open}
        title="Konfirmasi Koreksi"
        onClose={() => setOpen(false)}
        actions={
          <div className="action-row">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={() => void submitCorrection()}>Simpan</Button>
          </div>
        }
      >
        <Textarea
          value={reason}
          onChange={setReason}
          rows={4}
          placeholder="Alasan koreksi minimal 10 karakter"
        />
      </Modal>
    </div>
  );
}
