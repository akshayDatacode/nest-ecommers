import {
  IsEmail,
  IsIn,
  IsString,
  MinLength,
} from 'class-validator';

export class SignupDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsIn(['admin', 'manager', 'user'], { message: 'Role must be admin, manager, or user' }) // Validate role
  role: 'admin' | 'manager' | 'user' = 'user'; // Default to 'user'
}