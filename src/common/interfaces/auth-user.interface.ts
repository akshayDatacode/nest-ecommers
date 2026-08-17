export interface AuthUser {
  sub: string;
  email: string;
  role: 'admin' | 'manager' | 'user';
  iat?: number;
  exp?: number;
}
