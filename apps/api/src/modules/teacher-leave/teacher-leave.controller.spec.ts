import { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { TeacherLeaveController } from './teacher-leave.controller';
import type { TeacherLeaveService } from './teacher-leave.service';

describe('TeacherLeaveController', () => {
  it('streams PDF bytes instead of serializing the Buffer as JSON', async () => {
    const buffer = Buffer.from('%PDF-test');
    const service = {
      getLetterPdf: jest.fn().mockResolvedValue({ buffer, filename: 'surat-izin-test.pdf' })
    } as unknown as TeacherLeaveService;
    const setHeader = jest.fn();
    const controller = new TeacherLeaveController(service);

    const result = await controller.letterPdf(
      'leave-test',
      { sub: 'user-test', role: 'GURU_MAPEL' },
      { setHeader } as unknown as Response
    );

    expect(result).toBeInstanceOf(StreamableFile);
    expect(result.getStream().read()).toEqual(buffer);
    expect(setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="surat-izin-test.pdf"');
    expect(setHeader).toHaveBeenCalledWith('Content-Length', String(buffer.length));
  });
});
