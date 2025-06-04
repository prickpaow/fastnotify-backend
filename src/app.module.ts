import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; // ✅ เพิ่ม
import { LineBotService } from './line-bot.service';
import { LineBotController } from './line-bot.controller';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // ✅ ทำให้ใช้ process.env ได้ทุกที่
    }),
  ],
  controllers: [LineBotController, AuthController],
  providers: [LineBotService, AuthService, JwtAuthGuard],
})
export class AppModule {}
