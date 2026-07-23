import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  it('menandai hanya notifikasi yang terlihat oleh pengguna', async () => {
    const notification = {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'notification-1', readAt: new Date() })
    };
    const service = new NotificationsService({ notification } as never);

    await service.markRead('notification-1', { sub: 'admin-1', role: Role.ADMIN_TU });

    expect(notification.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'notification-1',
        OR: [{ userId: 'admin-1' }, { role: Role.ADMIN_TU }, { userId: null, role: null }]
      },
      data: { readAt: expect.any(Date) }
    });
  });

  it('menolak ID notifikasi di luar audience pengguna', async () => {
    const notification = {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirstOrThrow: jest.fn()
    };
    const service = new NotificationsService({ notification } as never);

    await expect(service.markRead('private-other-user', { sub: 'student-1', role: Role.SISWA })).rejects.toBeInstanceOf(NotFoundException);
    expect(notification.findFirstOrThrow).not.toHaveBeenCalled();
  });
});
