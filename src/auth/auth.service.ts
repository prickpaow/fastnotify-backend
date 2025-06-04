import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { firestore } from '../firebase';

@Injectable()
export class AuthService {
  async register(email: string, password: string) {
    const usersRef = firestore.collection('users');
    const snapshot = await usersRef.where('email', '==', email).get();
    if (!snapshot.empty) throw new Error('อีเมลนี้ถูกใช้แล้ว');

    const hash = await bcrypt.hash(password, 10);
    const userDoc = await usersRef.add({ email, password: hash, role: 'user' });
    return { id: userDoc.id, email };
  }

  async login(email: string, password: string) {
    const usersRef = firestore.collection('users');
    const snapshot = await usersRef.where('email', '==', email).get();
    if (snapshot.empty) throw new Error('ไม่พบผู้ใช้');

    const doc = snapshot.docs[0];
    const user = doc.data();
    const match = await bcrypt.compare(password, user.password);
    if (!match) throw new Error('รหัสผ่านไม่ถูกต้อง');

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error('Missing JWT_SECRET');

    const token = jwt.sign({ userId: doc.id, email }, jwtSecret, { expiresIn: '7d' });
    return { token };
  }

  verify(token: string) {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error('Missing JWT_SECRET');
    return jwt.verify(token, jwtSecret) as { userId: string; email: string };
  }
}
