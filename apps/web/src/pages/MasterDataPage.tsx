import { useEffect, useMemo, useState } from 'react';
import {
  createClass,
  createSubject,
  createUser,
  enrollStudent,
  listClasses,
  listStudents,
  listSubjects,
  listUsers
} from '../lib/api';
import { Badge, Button, Card, EmptyState, Input, Select, StatusPill, Table, Tabs, TabsContent, TabsList, TabsTrigger, Timeline, useToast } from '../components/ui';
import { labelForRole, labelForStatus } from '../lib/uiLabels';

interface UserItem {
  id: string;
  username: string;
  fullName: string;
  role: string;
  cardStatus?: string;
  active?: boolean;
}

interface ClassItem {
  id: string;
  code: string;
  name: string;
  yearLabel: string;
}

interface SubjectItem {
  id: string;
  code: string;
  name: string;
}

interface StudentItem {
  id: string;
  username: string;
  fullName: string;
  enrollments?: Array<{ schoolClass: { code: string } }>;
}

export function MasterDataPage() {
  const { pushToast } = useToast();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('SchoolHub#2026');
  const [role, setRole] = useState('SISWA');

  const [classCode, setClassCode] = useState('');
  const [className, setClassName] = useState('');
  const [yearLabel, setYearLabel] = useState('2025/2026');

  const [subjectCode, setSubjectCode] = useState('');
  const [subjectName, setSubjectName] = useState('');

  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [userData, classData, subjectData, studentData] = await Promise.all([
        listUsers(),
        listClasses(),
        listSubjects(),
        listStudents()
      ]);
      setUsers(userData);
      setClasses(classData);
      setSubjects(subjectData);
      setStudents(studentData);

      if (!selectedStudentId && studentData[0]) {
        setSelectedStudentId(studentData[0].id);
      }
      if (!selectedClassId && classData[0]) {
        setSelectedClassId(classData[0].id);
      }
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal memuat master data.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreateUser() {
    if (!username || !fullName || !password) {
      pushToast('Form user belum lengkap.', 'error');
      return;
    }

    try {
      await createUser({
        username,
        fullName,
        password,
        role,
        cardStatus: 'ACTIVE'
      });
      pushToast('User baru berhasil ditambahkan.', 'success');
      setUsername('');
      setFullName('');
      await load();
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal menambah user.', 'error');
    }
  }

  async function handleCreateClass() {
    if (!classCode || !className || !yearLabel) {
      pushToast('Form kelas belum lengkap.', 'error');
      return;
    }

    try {
      await createClass({ code: classCode, name: className, yearLabel });
      pushToast('Kelas baru berhasil ditambahkan.', 'success');
      setClassCode('');
      setClassName('');
      await load();
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal menambah kelas.', 'error');
    }
  }

  async function handleCreateSubject() {
    if (!subjectCode || !subjectName) {
      pushToast('Form mapel belum lengkap.', 'error');
      return;
    }

    try {
      await createSubject({ code: subjectCode, name: subjectName });
      pushToast('Mapel baru berhasil ditambahkan.', 'success');
      setSubjectCode('');
      setSubjectName('');
      await load();
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal menambah mapel.', 'error');
    }
  }

  async function handleEnroll() {
    if (!selectedStudentId || !selectedClassId) {
      pushToast('Pilih siswa dan kelas dahulu.', 'error');
      return;
    }

    try {
      await enrollStudent({ userId: selectedStudentId, classId: selectedClassId });
      pushToast('Pendaftaran siswa ke kelas berhasil.', 'success');
      await load();
    } catch (err: any) {
      pushToast(err?.response?.data?.message ?? 'Gagal mendaftarkan siswa.', 'error');
    }
  }

  const studentUsers = useMemo(() => users.filter((item) => item.role === 'SISWA'), [users]);

  return (
    <div className="stack">
      <Card variant="elevated" className="hero-card">
        <h2>Master Data</h2>
        <p>Kelola pengguna, struktur akademik, dan pendaftaran kelas.</p>
      </Card>

      <Tabs defaultValue="registrasi">
        <TabsList>
          <TabsTrigger value="registrasi">Registrasi</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
        </TabsList>

        <TabsContent value="registrasi">
          <section className="grid cols-2">
            <Card>
              <h3>Tambah Pengguna</h3>
              <div className="stack-sm">
                <label>Username</label>
                <Input value={username} onChange={setUsername} />
                <label>Nama Lengkap</label>
                <Input value={fullName} onChange={setFullName} />
                <label>Password</label>
                <Input type="password" value={password} onChange={setPassword} />
                <label>Peran</label>
                <Select
                  value={role}
                  onChange={setRole}
                  options={[
                    { label: labelForRole('ADMIN_TU'), value: 'ADMIN_TU' },
                    { label: labelForRole('OPERATOR_IT'), value: 'OPERATOR_IT' },
                    { label: labelForRole('GURU_MAPEL'), value: 'GURU_MAPEL' },
                    { label: labelForRole('GURU_PIKET'), value: 'GURU_PIKET' },
                    { label: labelForRole('SISWA'), value: 'SISWA' }
                  ]}
                />
                <Button onClick={() => void handleCreateUser()}>Simpan Pengguna</Button>
              </div>
            </Card>

            <Card>
              <h3>Tambah Kelas</h3>
              <div className="stack-sm">
                <label>Kode</label>
                <Input value={classCode} onChange={setClassCode} placeholder="X-MIA-3" />
                <label>Nama</label>
                <Input value={className} onChange={setClassName} placeholder="Kelas X MIA 3" />
                <label>Tahun Ajaran</label>
                <Input value={yearLabel} onChange={setYearLabel} placeholder="2025/2026" />
                <Button onClick={() => void handleCreateClass()}>Simpan Kelas</Button>
              </div>
            </Card>
          </section>

          <section className="grid cols-2">
            <Card>
              <h3>Tambah Mata Pelajaran</h3>
              <div className="stack-sm">
                <label>Kode Mapel</label>
                <Input value={subjectCode} onChange={setSubjectCode} placeholder="BAR-X" />
                <label>Nama Mapel</label>
                <Input value={subjectName} onChange={setSubjectName} placeholder="Bahasa Arab" />
                <Button onClick={() => void handleCreateSubject()}>Simpan Mapel</Button>
              </div>
            </Card>

            <Card>
              <h3>Pendaftaran Kelas</h3>
              <div className="stack-sm">
                <label>Siswa</label>
                <Select
                  value={selectedStudentId}
                  onChange={setSelectedStudentId}
                  options={
                    studentUsers.length > 0
                      ? studentUsers.map((item) => ({ label: item.fullName, value: item.id }))
                      : [{ label: 'Belum ada siswa', value: '' }]
                  }
                />

                <label>Kelas</label>
                <Select
                  value={selectedClassId}
                  onChange={setSelectedClassId}
                  options={
                    classes.length > 0
                      ? classes.map((item) => ({ label: `${item.code} · ${item.name}`, value: item.id }))
                      : [{ label: 'Belum ada kelas', value: '' }]
                  }
                />

                <Button onClick={() => void handleEnroll()}>Daftarkan Siswa</Button>
              </div>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="data">
          <Card>
            {users.length === 0 && !loading ? (
              <EmptyState title="Belum ada pengguna" description="Tambahkan pengguna untuk memulai." />
            ) : (
              <Table
                rows={users}
                loading={loading}
                title="Daftar Pengguna"
                searchPlaceholder="Cari nama, username, atau peran"
                searchAccessor={(user) => `${user.username} ${user.fullName} ${user.role}`}
                columns={[
                  {
                    key: 'username',
                    header: 'Username',
                    sortable: true,
                    accessor: (user) => user.username,
                    sortAccessor: (user) => user.username
                  },
                  {
                    key: 'fullName',
                    header: 'Nama',
                    sortable: true,
                    accessor: (user) => user.fullName,
                    sortAccessor: (user) => user.fullName
                  },
                  {
                    key: 'role',
                    header: 'Peran',
                    sortable: true,
                    accessor: (user) => <Badge tone="info">{labelForRole(user.role)}</Badge>,
                    sortAccessor: (user) => user.role
                  },
                  {
                    key: 'cardStatus',
                    header: 'Status Kartu',
                    accessor: (user) => <StatusPill status={user.cardStatus ?? 'ACTIVE'} />
                  },
                  {
                    key: 'account',
                    header: 'Status Akun',
                    accessor: (user) => (
                      <Badge tone={user.active ? 'success' : 'warning'}>{labelForStatus(user.active ? 'ACTIVE' : 'INACTIVE')}</Badge>
                    )
                  }
                ]}
              />
            )}
          </Card>

          <section className="grid cols-2">
            <Card>
              {classes.length === 0 && !loading ? (
                <EmptyState title="Belum ada kelas" description="Tambahkan kelas dari tab Registrasi." />
              ) : (
                <Timeline
                  items={classes.map((item) => ({
                    id: item.id,
                    title: item.code,
                    description: item.name,
                    badge: <Badge tone="neutral">{item.yearLabel}</Badge>
                  }))}
                  emptyTitle="Belum ada kelas"
                  emptyDescription="Tambahkan kelas terlebih dahulu."
                />
              )}
            </Card>

            <Card>
              {subjects.length === 0 && !loading ? (
                <EmptyState title="Belum ada mapel" description="Tambahkan mapel dari tab Registrasi." />
              ) : (
                <Timeline
                  items={subjects.map((item) => ({
                    id: item.id,
                    title: item.code,
                    description: item.name
                  }))}
                  emptyTitle="Belum ada mapel"
                  emptyDescription="Tambahkan mapel terlebih dahulu."
                />
              )}
            </Card>
          </section>

          <Card>
            {students.length === 0 && !loading ? (
              <EmptyState title="Belum ada siswa" description="Tambahkan akun siswa dan lakukan pendaftaran kelas." />
            ) : (
              <Table
                rows={students}
                loading={loading}
                title="Daftar Siswa"
                searchPlaceholder="Cari nama atau username"
                searchAccessor={(student) => `${student.fullName} ${student.username}`}
                columns={[
                  {
                    key: 'fullName',
                    header: 'Nama',
                    sortable: true,
                    accessor: (student) => student.fullName,
                    sortAccessor: (student) => student.fullName
                  },
                  {
                    key: 'username',
                    header: 'Username',
                    sortable: true,
                    accessor: (student) => student.username,
                    sortAccessor: (student) => student.username
                  },
                  {
                    key: 'classes',
                    header: 'Kelas',
                    accessor: (student) =>
                      student.enrollments && student.enrollments.length > 0
                        ? student.enrollments.map((item) => item.schoolClass.code).join(', ')
                        : '-'
                  }
                ]}
              />
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
