import { IErrorService } from './types';

export class NoOpErrorService implements IErrorService {
  captureError(_error: Error, _context?: Record<string, unknown>): void {}
  captureMessage(_message: string, _context?: Record<string, unknown>): void {}
}
