import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsOptional()
  @IsIn(['admin', 'guru', 'pegawai', 'siswa'])
  expectedRole?: 'admin' | 'guru' | 'pegawai' | 'siswa';
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(12)
  newPassword!: string;
}


export class LoginLockoutStatusQueryDto {
  @IsString()
  @MinLength(1)
  username!: string;
}

export class LoginLockoutUserSearchQueryDto {
  @IsString()
  @MinLength(2)
  q!: string;
}

export class ClearLoginLockoutDto {
  @IsString()
  @MinLength(1)
  username!: string;

  @IsString()
  @MinLength(8)
  reason!: string;
}
