import crypto from 'node:crypto';

export function validateTelegramInitData(initData: string, botToken: string, maxAgeSeconds = 3600) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new Error('Missing Telegram hash');
  params.delete('hash');
  params.delete('signature');
  const dataCheck = [...params.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
  const a = Buffer.from(calculated, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) throw new Error('Invalid Telegram signature');
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Math.abs(Date.now()/1000 - authDate) > maxAgeSeconds) throw new Error('Expired Telegram session');
  const rawUser = params.get('user');
  if (!rawUser) throw new Error('Missing Telegram user');
  return JSON.parse(rawUser) as {id:number;username?:string;first_name?:string};
}
