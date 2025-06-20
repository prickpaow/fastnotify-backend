import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true }); // ✅ เปิด CORS
  await app.listen(3001);
}
bootstrap();