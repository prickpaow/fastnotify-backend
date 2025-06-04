import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Missing token');
    }

    const token = authHeader.replace('Bearer ', '');
    const payload = this.authService.verify(token);

    if (!payload || !payload.userId) {
      throw new UnauthorizedException('Invalid token payload');
    }

    req.user = {
      userId: payload.userId, // ✅ ให้ตรงกับที่ controller ใช้
    };

    return true;
  }
}
