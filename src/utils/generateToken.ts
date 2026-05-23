import { v4 as uuidv4 } from 'uuid';

export function generateToken(): string {
  return uuidv4();
}
