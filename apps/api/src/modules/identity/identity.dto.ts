import { CardStatus, Role } from '@prisma/client';
import { IsEnum, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  username!: string;

  @IsString()
  fullName!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(Role)
  role!: Role;

  @IsEnum(CardStatus)
  cardStatus: CardStatus = CardStatus.ACTIVE;
}

export class UpdateMeDto {
  @IsString()
  @MinLength(3)
  fullName!: string;
}
