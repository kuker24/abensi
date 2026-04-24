export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
}

export interface LoginResponse {
  accessToken: string;
  user: SessionUser;
}
