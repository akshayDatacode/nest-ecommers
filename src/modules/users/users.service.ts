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
}