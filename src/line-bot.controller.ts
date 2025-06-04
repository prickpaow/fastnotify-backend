import { Body, Controller, Post, Get, Patch, Param, UseGuards, Req, UnauthorizedException, NotFoundException, Query } from '@nestjs/common';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { LineBotService } from './line-bot.service';
import { firestore } from './firebase';
import * as jwt from 'jsonwebtoken';
import { LineBot } from './line-bot.types';
import fetch from 'node-fetch';

@Controller('api/line-bot')
export class LineBotController {
  constructor(private readonly botService: LineBotService) {}

  // 🟢 ผูก LINE Bot กับ user
  @Post('register')
  @UseGuards(JwtAuthGuard)
  registerBot(
    @Body() body: { name: string; accessToken: string; lineUserId: string },
    @Req() req: any
  ) {
    console.log('[registerBot] req.user =', req.user);
    return this.botService.createBot({
      ...body,
      assignedTo: req.user.userId, // ✅ ต้องไม่ undefined
    });
  }
  
  @Get('available-bot')
  async getAvailableBot() {
    const snap = await firestore.collection('bots')
      .where('assignedTo', '==', '')
      .limit(1)
      .get();

    if (snap.empty) throw new NotFoundException('ไม่มีบอทที่พร้อมใช้งาน');

    const bot = snap.docs[0].data();
    return {
      name: bot.name,
      botId: bot.botId,
      accessToken: bot.accessToken,
    };
  }

  @Post('webhook')
  async handleWebhook(@Body() body: any, @Query('token') token?: string) {
    const event = body?.events?.[0];
    const lineUserId = event?.source?.userId || 'N/A';
    const replyToken = event?.replyToken || 'N/A';
    const type = event?.type || 'unknown';

    console.log('📥 [TEST WEBHOOK]');
    console.log('🔸 type:', type);
    console.log('🔸 lineUserId:', lineUserId);
    console.log('🔸 replyToken:', replyToken);
    console.log('🔸 token (query):', token || '—');

    if (!lineUserId || lineUserId === 'N/A') {
      return { status: 'ignored', error: 'No LINE User ID found' };
    }

    // ✅ เคสเปิดผ่าน /connect?token=...
    if (token) {
      try {
        const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        const userId = decoded.userId;
        console.log('✅ JWT decoded userId =', userId);

        // บันทึกการเชื่อมโยงลง Firestore
        await firestore.collection('bindings').add({
          userId,
          lineUserId,
          createdAt: new Date().toISOString(),
        });

        // ตอบกลับ
        await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: lineUserId,
            messages: [
              {
                type: 'text',
                text: `✅ เชื่อมต่อสำเร็จแล้ว!\nLINE ID: ${lineUserId}\nuserId: ${userId}`,
              },
            ],
          }),
        });

        return { status: 'bound', userId, lineUserId };
      } catch (err: any) {
        console.error('❌ JWT decode failed', err);
        return { status: 'error', error: 'Invalid token' };
      }
    }

    // ✅ เคสลูกค้าทัก LINE โดยตรง (ไม่มี token)
    const bindingSnap = await firestore
      .collection('bindings')
      .where('lineUserId', '==', lineUserId)
      .limit(1)
      .get();

    if (bindingSnap.empty) {
      // ❌ ยังไม่ได้เชื่อม
      await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: lineUserId,
          messages: [
            {
              type: 'text',
              text: '❗ ยังไม่ได้เชื่อมบัญชี กรุณาสแกน QR อีกครั้งเพื่อเชื่อมต่อ',
            },
          ],
        }),
      });

      return { status: 'unlinked', lineUserId };
    }

    // ✅ เจอแล้ว → ตอบกลับ
    const binding = bindingSnap.docs[0].data();
    const userId = binding.userId;

    console.log('✅ ผู้ใช้ที่เชื่อมแล้ว =', userId);

    await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [
          {
            type: 'text',
            text: `📬 สวัสดีคุณ ${userId}, ข้อความของคุณได้รับแล้ว!`,
          },
        ],
      }),
    });

    return { status: 'linked', userId };
  }
    
  
  // 🟢 ส่งข้อความ LINE
  @Post('send')
  @UseGuards(JwtAuthGuard)
  sendMessage(@Body() body: { message: string }, @Req() req: any) {
    return this.botService.sendMessage(req.user.userId, body.message);
  }

  // 🟢 ดึง bot ของตัวเอง
  @Get('my-bot')
  @UseGuards(JwtAuthGuard)
  async getMyBot(@Req() req: any): Promise<LineBot | undefined> {
    return this.botService.getBotByUser(req.user.userId);
  }

  // 🟢 ดึงประวัติข้อความทั้งหมด
  @Get('logs')
  getAllLogs() {
    return this.botService.getLogs();
  }

  // 🟢 ดึงรายชื่อผู้ใช้ทั้งหมด
  @Get('admin/users')
  @UseGuards(JwtAuthGuard)
  getAllUsers() {
    return this.botService.getUsersWithBotCount(); // ✅ ต้อง return เป็น array
  }
  
  

  @Post('admin/broadcast')
  @UseGuards(JwtAuthGuard)
  async broadcast(@Body() body: { message: string }, @Req() req: any) {
    const userSnap = await firestore.collection('users').doc(req.user.userId).get();
    const user = userSnap.data();
  
    if (!user || user.role !== 'admin') {
      throw new UnauthorizedException('Only admin can broadcast');
    }
  
    return this.botService.broadcast(body.message);
  }
  
  @Get('auth/me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Req() req: any) {
    const doc = await firestore.collection('users').doc(req.user.userId).get();
    const data = doc.data();
    return {
      userId: req.user.userId,
      email: data?.email,
      role: data?.role || 'user',
    };
  }

  @Patch('admin/promote/:userId')
  @UseGuards(JwtAuthGuard)
  async promoteUser(@Param('userId') userId: string, @Req() req: any) {
    const me = await firestore.collection('users').doc(req.user.userId).get();
    if (!me.exists || me.data()?.role !== 'admin') {
      throw new UnauthorizedException('Only admin can promote');
    }
  
    await firestore.collection('users').doc(userId).update({ role: 'admin' });
    return { success: true, userId };
  }
}
