import * as crypto from 'crypto';
import { MailerService } from '@nestjs-modules/mailer';

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  InjectModel,
} from '@nestjs/mongoose';

import {
  Model,
} from 'mongoose';

import {
  User,
  UserDocument,
} from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly mailerService: MailerService, // Inject MailerService
  ) { }

  async findByEmail(email: string) {
    return this.userModel
      .findOne({
        email: email.toLowerCase(),
      })
      .exec();
  }

  async findById(id: string) {
    return this.userModel
      .findById(id)
      .select('-password')
      .exec();
  }

  async createUser(
    name: string,
    email: string,
    password: string,
  ) {
    const existingUser = await this.findByEmail(email);

    if (existingUser) {
      throw new ConflictException(
        'Email already registered',
      );
    }

    const user = await this.userModel.create({
      name,
      email: email.toLowerCase(),
      password,
    });

    return user;
  }

  async generateEmailVerificationToken(userId: string) {
    const token = crypto.randomBytes(32).toString('hex'); // Generate a random token
    const expires = new Date();
    expires.setHours(expires.getHours() + 1); // Token expires in 1 hour

    await this.userModel.findByIdAndUpdate(userId, {
      emailVerificationToken: token,
      emailVerificationTokenExpires: expires,
    });

    return token;
  }

  async sendVerificationEmail(userId: any, email: string) {
    const token = await this.generateEmailVerificationToken(userId);

    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

    await this.mailerService.sendMail({
      to: email,
      subject: 'Verify Your Email',
      template: './verify-email', // Path to email template
      context: {
        name: email,
        verificationUrl,
      },
    });
  }

  async verifyEmail(token: string) {
    const user = await this.userModel.findOne({
      emailVerificationToken: token,
      emailVerificationTokenExpires: { $gt: new Date() }, // Ensure token is not expired
    });
  
    if (!user) {
      throw new NotFoundException('Invalid or expired token');
    }
  
    user.emailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationTokenExpires = null;
  
    await user.save();
  
    return { message: 'Email verified successfully' };
  }
}