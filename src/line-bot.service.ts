import { Injectable } from '@nestjs/common';
import { firestore } from './firebase';
import { LineBot } from './line-bot.types';


@Injectable()
export class LineBotService {
  async createBot(bot: { name: string; accessToken: string; lineUserId: string; assignedTo: string }) {
    if (!bot.assignedTo) throw new Error('assignedTo (userId) is required');

    return firestore.collection('bots').add({
      ...bot,
      createdAt: Date.now(),
    });
  }

  async getBotByUser(userId: string): Promise<LineBot | undefined> {
    if (!userId) throw new Error('userId is required');

    const snap = await firestore
      .collection('bots')
      .where('assignedTo', '==', userId)
      .limit(1)
      .get();

    if (snap.empty) return undefined;

    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() } as LineBot;
  }

  async sendMessage(userId: string, message: string) {
    const bot = await this.getBotByUser(userId);
    if (!bot) throw new Error('ยังไม่มีการเชื่อมต่อ Bot');

    const messages = this.formatMessages(message);

    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bot.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: bot.lineUserId,
        messages,
      }),
    });

    // ✅ บันทึกประวัติลง Firestore
    await firestore.collection('logs').add({
      userId,
      botName: bot.name,
      message,
      timestamp: Date.now(),
    });

    return res.json();
  }

  async getLogs() {
    const snapshot = await firestore
      .collection('logs')
      .orderBy('timestamp', 'desc')
      .get();
    return snapshot.docs.map(doc => doc.data());
  }

  async getAllUsers() {
    const snapshot = await firestore.collection('users').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async broadcast(raw: string) {
    const botsRef = firestore.collection('bots');
    const snapshot = await botsRef.get();
    const results: { bot: string; status: number }[] = [];

    for (const doc of snapshot.docs) {
      const bot = doc.data();
      // if (!bot.lineUserId || !bot.accessToken) {
      //   results.push({ bot: bot.name || doc.id, status: 0 });
      //   continue;
      // }
      if (!bot.lineUserId || !bot.accessToken) {
        throw new Error('❌ Bot ยังไม่มีข้อมูล lineUserId หรือ accessToken');
      }
      
      const messages = this.formatMessages(raw);

      try {
        const res = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${bot.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: bot.lineUserId,
            messages,
          }),
        });

        results.push({ bot: bot.name || doc.id, status: res.status });
      } catch (err) {
        results.push({ bot: bot.name || doc.id, status: 500 });
        console.error(`[Broadcast Error] ${bot.name}:`, err);
      }
    }

    return results;
  }

  private formatMessages(input: string): any[] {
    if (input.startsWith('image:')) {
      const url = input.slice(6).trim();
      return [{ type: 'image', originalContentUrl: url, previewImageUrl: url }];
    }

    if (input.startsWith('sticker:')) {
      const [packageId, stickerId] = input.slice(8).split(',');
      return [{ type: 'sticker', packageId, stickerId }];
    }

    if (input.startsWith('flex:')) {
      try {
        const json = JSON.parse(input.slice(5));
        return [{ type: 'flex', altText: '📦 Rich Message', contents: json }];
      } catch {
        return [{ type: 'text', text: '⚠️ Flex message ผิดรูปแบบ' }];
      }
    }

    return [{ type: 'text', text: input }];
  }

  async getUsersWithBotCount() {
    const usersSnap = await firestore.collection('users').get();
    const botsSnap = await firestore.collection('bots').get();

    const bots = botsSnap.docs.map(doc => doc.data() as any);

    return usersSnap.docs.map(doc => {
      const userId = doc.id;
      const userData = doc.data();
      const botCount = bots.filter(bot => bot.assignedTo === userId).length;

      return {
        id: userId,
        email: userData.email,
        role: userData.role || 'user',
        botCount,
        hasBot: botCount > 0,
      };
    });
  }
}
