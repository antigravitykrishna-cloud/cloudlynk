import type { Database } from '@/lib/database.types';

type Functions = Database['public']['Functions'];

/** One row of a set-returning RPC, as the generated database types describe it. */
export type RpcRow<Name extends keyof Functions> = Functions[Name]['Returns'] extends (infer Row)[]
  ? Row
  : never;
