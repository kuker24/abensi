import { NotFoundException } from '@nestjs/common';
import { PicketBookService } from './picket-book.service';

function makePrisma() {
  const prisma = {
    picketNote: {
      count: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn()
    },
    auditEntry: {
      create: jest.fn()
    }
  } as any;
  prisma.$transaction = jest.fn(async (callback: any) => callback(prisma));
  return prisma;
}

describe('PicketBookService', () => {
  const actor = { sub: 'admin-1', role: 'ADMIN_TU' };

  it('lists notes with date/category/severity/active filters', async () => {
    const prisma = makePrisma();
    prisma.picketNote.count.mockResolvedValue(1);
    prisma.picketNote.findMany.mockResolvedValue([{ id: 'note-1', title: 'Piket' }]);
    const service = new PicketBookService(prisma);

    const result = await service.list({ page: 1, limit: 10, skip: 0 }, { date: '2026-04-25', category: 'UMUM', severity: 'INFO', active: 'true' });

    expect(result.items).toHaveLength(1);
    expect(prisma.picketNote.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ category: 'UMUM', severity: 'INFO', active: true, date: expect.any(Object) })
    });
    expect(result.meta.total).toBe(1);
  });

  it('creates note and writes audit entry', async () => {
    const prisma = makePrisma();
    prisma.picketNote.create.mockResolvedValue({ id: 'note-1', title: 'Gerbang', body: 'Aman' });
    const service = new PicketBookService(prisma);

    const result = await service.create({ date: '2026-04-25T00:00:00.000Z', title: 'Gerbang', body: 'Aman' }, actor);

    expect(result.id).toBe('note-1');
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ module: 'picket', action: 'picket.note.created', resourceId: 'note-1' })
    });
  });

  it('updates note and writes audit entry', async () => {
    const prisma = makePrisma();
    prisma.picketNote.findUnique.mockResolvedValue({ id: 'note-1', title: 'Lama' });
    prisma.picketNote.update.mockResolvedValue({ id: 'note-1', title: 'Baru' });
    const service = new PicketBookService(prisma);

    const result = await service.update('note-1', { title: 'Baru', reason: 'Perbaikan catatan' }, actor);

    expect(result.title).toBe('Baru');
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'picket.note.updated', before: expect.objectContaining({ title: 'Lama' }) })
    });
  });

  it('deactivates note with audit action', async () => {
    const prisma = makePrisma();
    prisma.picketNote.findUnique.mockResolvedValue({ id: 'note-1', active: true });
    prisma.picketNote.update.mockResolvedValue({ id: 'note-1', active: false });
    const service = new PicketBookService(prisma);

    const result = await service.deactivate('note-1', actor, 'Duplikat');

    expect(result.active).toBe(false);
    expect(prisma.auditEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'picket.note.deactivated', reason: 'Duplikat' })
    });
  });

  it('throws not found when note does not exist', async () => {
    const prisma = makePrisma();
    prisma.picketNote.findUnique.mockResolvedValue(null);
    const service = new PicketBookService(prisma);

    await expect(service.update('missing', { title: 'Nope' }, actor)).rejects.toBeInstanceOf(NotFoundException);
  });
});
