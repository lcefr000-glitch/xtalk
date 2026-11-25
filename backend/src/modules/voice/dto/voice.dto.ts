import { IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class CreateRoomDto {
  @IsString()
  @Length(3, 80)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @Matches(/^[a-z]{2}$/)
  languageCode?: string;
}

export class RoomRoleDto {
  @IsString()
  userId!: string;

  @IsIn(['SPEAKER', 'LISTENER'])
  role!: 'SPEAKER' | 'LISTENER';
}

export class RoomUserDto {
  @IsString()
  userId!: string;
}

export class StartCallDto {
  @IsString()
  calleeId!: string;

  @IsIn(['AUDIO', 'VIDEO'])
  type!: 'AUDIO' | 'VIDEO';
}
