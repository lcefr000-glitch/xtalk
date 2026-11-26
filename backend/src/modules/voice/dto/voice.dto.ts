import { IsBoolean, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

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

  @IsOptional()
  @IsIn(['chat', 'music'])
  mode?: 'chat' | 'music';

  @IsOptional()
  @IsString()
  @MaxLength(60)
  topic?: string;

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
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

export class RoomThemeDto {
  @IsString()
  theme!: string;
}
