import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Ip, Param, Post, Headers } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService, GoogleLoginDto } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto, ResetPasswordDto, VerifyEmailDto } from './dto/email-token.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(200)
  @Post('signup-code')
  signupCode(@Body() body: { email: string }) {
    if (!body?.email || typeof body.email !== 'string' || !/^[^@\s]+@[^@\s]+$/.test(body.email)) throw new BadRequestException('Invalid email');
    return this.auth.sendSignupCode(body.email);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('register')
  register(@Body() dto: RegisterDto, @Ip() ip: string, @Headers('user-agent') ua?: string) {
    return this.auth.register(dto, { ip, userAgent: ua });
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto, @Ip() ip: string, @Headers('user-agent') ua?: string) {
    return this.auth.login(dto, { ip, userAgent: ua });
  }

  /** Web client ID the app must request ID tokens for (first entry of GOOGLE_CLIENT_ID). Not a secret. */
  @Public()
  @Get('google/config')
  googleConfig() {
    const id = (process.env.GOOGLE_CLIENT_ID ?? '').split(',').map((x) => x.trim()).filter(Boolean)[0];
    return { clientId: id ?? null };
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(200)
  @Post('google')
  google(@Body() dto: GoogleLoginDto, @Ip() ip: string, @Headers('user-agent') ua?: string) {
    return this.auth.googleLogin(dto, { ip, userAgent: ua });
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Ip() ip: string, @Headers('user-agent') ua?: string) {
    return this.auth.refresh(dto.refreshToken, { ip, userAgent: ua });
  }

  @Public()
  @HttpCode(200)
  @Post('logout')
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('logout-all')
  logoutAll(@CurrentUser() user: AuthUser) {
    return this.auth.logoutAll(user.id);
  }

  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(200)
  @Post('email-code/send')
  sendEmailCode(@CurrentUser() user: AuthUser) {
    return this.auth.sendAccountCode(user.id);
  }

  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(200)
  @Post('email-code/verify')
  verifyEmailCode(@CurrentUser() user: AuthUser, @Body() body: { code: string }) {
    if (!body || typeof body.code !== 'string' || !/^\d{6}$/.test(body.code.trim())) throw new BadRequestException('Enter the 6-digit code');
    return this.auth.verifyAccountCode(user.id, body.code);
  }

  @Public()
  @HttpCode(200)
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(200)
  @Post('resend-verification')
  resendVerification(@Body() dto: ForgotPasswordDto) {
    return this.auth.resendVerification(dto.email);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(200)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(200)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @ApiBearerAuth()
  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser) {
    return this.auth.sessions(user.id);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Delete('sessions/:id')
  revokeSession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.auth.revokeSession(user.id, id);
  }
}
