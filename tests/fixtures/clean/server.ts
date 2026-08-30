import { GET } from '@solidjs/web/server-functions';

export async function findUser(id: string) {
  'use server';
  return { id };
}

export const loadUser = GET(async (id: string) => {
  'use server';
  return { id };
});

