import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({
  timestamps: true,
})
export class User {
  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  })
  email: string;

  @Prop({
    required: true,
    minlength: 8,
  })
  password: string;

  @Prop({
    required: true,
    trim: true,
  })
  name: string;

  @Prop({
    default: false,
  })
  emailVerified: boolean;

  @Prop({
    default: true,
  })
  isActive: boolean;

  @Prop({
    type: String,
    default: null,
  })
  refreshToken: string | null;

  @Prop({
    type: String, // Explicitly specify the type
    default: null,
  })
  emailVerificationToken: string | null;

  @Prop({
    type: Date, // Explicitly specify the type
    default: null,
  })
  emailVerificationTokenExpires: Date | null;

  @Prop({
    type: String,
    default: null,
  })
  resetPasswordToken: string | null;
  
  @Prop({
    type: Date,
    default: null,
  })
  resetPasswordTokenExpires: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);