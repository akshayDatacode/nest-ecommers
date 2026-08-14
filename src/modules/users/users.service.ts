import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
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
import { join } from 'path';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly mailerService: MailerService, // Inject MailerService
  ) { }

  async findByEmail(email: string) {
    console.log("email from user service", email)
    return this.userModel
      .findOne({
        email: email?.toLowerCase(),
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

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.userModel.create({
      name,
      email: email?.toLowerCase(),
      password: hashedPassword,
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

    console.log('Sending email with context:', {
      name: email,
      verificationUrl,
    });

    console.log('Template path:', join(__dirname, '..', 'templates/emails/verify-email.hbs'));

    await this.mailerService.sendMail({
      to: email,
      subject: 'Verify Your Email',
      // template: './verify-email', // Path to email template
      html: `
        <h1>Hello ${email},</h1>
        <p>Thank you for registering with us. Please verify your email by clicking the link below:</p>
        <a href="${verificationUrl}" target="_blank">Verify Email</a>
        <p>If you did not request this, please ignore this email.</p>
        <p>Thank you,<br>The Team</p>
      `,
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

  async forgotPassword(email: string) {
    const user = await this.findByEmail(email);

    if (!user) {
      throw new NotFoundException('User not found..');
    }

    const token = crypto.randomBytes(32).toString('hex'); // Generate a secure token
    const expires = new Date();
    expires.setHours(expires.getHours() + 1); // Token expires in 1 hour

    // Hash the token before storing it in the database
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    await this.userModel.findByIdAndUpdate(user._id, {
      resetPasswordToken: hashedToken,
      resetPasswordTokenExpires: expires,
    });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    // Send the reset password email
    await this.mailerService.sendMail({
      to: email,
      subject: 'Reset Your Password',
      // template: './reset-password',
      // context: {
      //   name: user.name,
      //   resetUrl,
      // },
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Reset Your Password</title>
        </head>
        <body>
          <h1>Hello ${user.name},</h1>
          <p>You requested to reset your password. Click the link below to reset it:</p>
          <a href="${resetUrl}" target="_blank">Reset Password</a>
          <p>If you did not request this, please ignore this email.</p>
          <p>Thank you,<br>The Team</p>
        </body>
        </html>
      `,
    });

    return { message: 'Password reset email sent' };
  }

  async resetPassword(token: string, newPassword: string) {
    // Hash the token to compare with the stored hashed token
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.userModel.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordTokenExpires: { $gt: new Date() }, // Ensure token is not expired
    });

    if (!user) {
      throw new NotFoundException('Invalid or expired token');
    }

    // Hash the new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update the user's password
    user.password = hashedNewPassword; // Ensure password is hashed before saving
    user.resetPasswordToken = null;
    user.resetPasswordTokenExpires = null;

    await user.save();

    return { message: 'Password reset successfully' };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify the current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new ConflictException('Current password is incorrect');
    }

    // Hash the new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update the user's password
    user.password = hashedNewPassword;
    await user.save();

    return { message: 'Password changed successfully' };
  }
}