import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Bot, InlineKeyboard } from 'grammy';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { validateTelegramInitData } from './auth.js';
import { accrue, TAP_REWARD, DAILY_REWARD, upgradeCost } from './game.js';

const db = new PrismaClient();
const app = Fastify({ logger: true });
const token = process.env.BOT_TOKEN || '';
const webUrl = process.env.WEBAPP_URL || '';
const admins = new Set((process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(x=>x.trim()).filter(Boolean));
const isAdmin = (id:string) => admins.has(id);

await app.register(cors, { origin: webUrl ? [webUrl] : false, methods:['GET','POST'] });
app.addHook('preHandler', async (req, reply) => {
  if (!req.url.startsWith('/api/')) return;
  const initData = req.headers['x-telegram-init-data'];
  if (typeof initData !== 'string' || !token) return reply.code(401).send({error:'Telegram authentication required'});
  try {
    const tg = validateTelegramInitData(initData, token);
    (req as any).tgUser = tg;
  } catch (e:any) {
    return reply.code(401).send({error:e.message || 'Invalid Telegram session'});
  }
});
async function getUser(req:any) {
  const tg = req.tgUser;
  const id = String(tg.id);
  let user = await db.user.findUnique({where:{id}});
  if (!user) user = await db.user.create({data:{id, username:tg.username, firstName:tg.first_name}});
  return user;
}
async function refresh(user:any) {
  const earned = accrue(user);
  if (earned > 0) {
    return db.user.update({where:{id:user.id},data:{oil:{increment:earned},totalEarned:{increment:earned},lastActiveAt:new Date()}});
  }
  return db.user.update({where:{id:user.id},data:{lastActiveAt:new Date()}});
}
app.get('/health', async()=>({ok:true,service:'oil-master'}));
app.post('/api/auth', async(req:any)=>{
  const user=await getUser(req); const fresh=await refresh(user);
  return {user:publicUser(fresh)};
});
function publicUser(u:any) {
 return {id:u.id,username:u.username,firstName:u.firstName,oil:u.oil,totalEarned:u.totalEarned,rigLevel:u.rigLevel,walletAddress:u.walletAddress};
}
app.get('/api/me', async(req:any)=>{ const u=await refresh(await getUser(req)); return {user:publicUser(u),upgradeCost:upgradeCost(u.rigLevel+1),dailyReward:DAILY_REWARD}; });
app.post('/api/tap', async(req:any,reply)=>{
  const u=await getUser(req);
  const body=z.object({count:z.number().int().min(1).max(10)}).safeParse(req.body);
  if(!body.success) return reply.code(400).send({error:'Invalid tap count'});
  const updated=await db.user.update({where:{id:u.id},data:{oil:{increment:body.data.count*TAP_REWARD},totalEarned:{increment:body.data.count*TAP_REWARD},lastActiveAt:new Date()}});
  await db.ledgerEntry.create({data:{userId:u.id,kind:'TAP',amount:body.data.count,note:'Oil production'}});
  return {user:publicUser(updated)};
});
app.post('/api/upgrade', async(req:any,reply)=>{
  const u=await refresh(await getUser(req)); const cost=upgradeCost(u.rigLevel+1);
  if(u.oil<cost) return reply.code(400).send({error:'Not enough oil',upgradeCost:cost});
  const updated=await db.user.update({where:{id:u.id},data:{oil:{decrement:cost},rigLevel:{increment:1},lastActiveAt:new Date()}});
  await db.ledgerEntry.create({data:{userId:u.id,kind:'UPGRADE',amount:-cost,note:`Rig level ${updated.rigLevel}` }});
  return {user:publicUser(updated),upgradeCost:upgradeCost(updated.rigLevel+1)};
});
app.post('/api/daily', async(req:any,reply)=>{
  const u=await getUser(req); const now=new Date();
  if(u.lastDailyAt && now.toDateString()===u.lastDailyAt.toDateString()) return reply.code(400).send({error:'Daily reward already claimed'});
  const updated=await db.user.update({where:{id:u.id},data:{oil:{increment:DAILY_REWARD},totalEarned:{increment:DAILY_REWARD},lastDailyAt:now}});
  await db.ledgerEntry.create({data:{userId:u.id,kind:'DAILY',amount:DAILY_REWARD}});
  return {user:publicUser(updated)};
});
app.post('/api/wallet', async(req:any,reply)=>{
 const parsed=z.object({address:z.string().min(10).max(128)}).safeParse(req.body);
 if(!parsed.success) return reply.code(400).send({error:'Invalid wallet address'});
 const u=await getUser(req);
 const updated=await db.user.update({where:{id:u.id},data:{walletAddress:parsed.data.address}});
 return {user:publicUser(updated)};
});
app.post('/api/withdraw', async(req:any,reply)=>{
 const parsed=z.object({amountTon:z.number().positive().max(1000)}).safeParse(req.body);
 if(!parsed.success) return reply.code(400).send({error:'Invalid amount'});
 const u=await getUser(req);
 if(!u.walletAddress) return reply.code(400).send({error:'Connect a TON wallet first'});
 const pending=await db.withdrawal.count({where:{userId:u.id,status:'PENDING'}});
 if(pending) return reply.code(409).send({error:'You already have a pending withdrawal'});
 const w=await db.withdrawal.create({data:{userId:u.id,amountTon:parsed.data.amountTon,wallet:u.walletAddress}});
 return {withdrawal:{id:w.id,status:w.status,amountTon:w.amountTon},message:'Request queued for manual review'};
});
app.get('/api/leaderboard', async()=>({items:await db.user.findMany({orderBy:{totalEarned:'desc'},take:20,select:{id:true,username:true,firstName:true,totalEarned:true,rigLevel:true}})}));
app.get('/api/referrals', async(req:any)=>{
 const u=await getUser(req); const count=await db.user.count({where:{referredBy:u.id}});
 return {count,link:`https://t.me/${process.env.BOT_USERNAME || 'OilMasterBot'}?start=${u.id}`};
});
app.get('/api/admin/withdrawals', async(req:any,reply)=>{
 const u=await getUser(req); if(!isAdmin(u.id)) return reply.code(403).send({error:'Forbidden'});
 const status=String((req.query as any)?.status||'PENDING');
 return {items:await db.withdrawal.findMany({where:{status},include:{user:{select:{id:true,username:true,firstName:true}}},orderBy:{createdAt:'asc'},take:100})};
});
app.post('/api/admin/withdrawals/:id/:action', async(req:any,reply)=>{
 const u=await getUser(req); if(!isAdmin(u.id)) return reply.code(403).send({error:'Forbidden'});
 const {id,action}=req.params as any;
 const item=await db.withdrawal.findUnique({where:{id}});
 if(!item) return reply.code(404).send({error:'Not found'});
 if(item.status!=='PENDING') return reply.code(409).send({error:'Request is not pending'});
 if(action==='approve') return {withdrawal:await db.withdrawal.update({where:{id},data:{status:'APPROVED'}})};
 if(action==='reject') return {withdrawal:await db.withdrawal.update({where:{id},data:{status:'REJECTED'}})};
 if(action==='paid') {
   const parsed=z.object({txHash:z.string().min(8).max(256)}).safeParse(req.body);
   if(!parsed.success) return reply.code(400).send({error:'Transaction hash required'});
   return {withdrawal:await db.withdrawal.update({where:{id},data:{status:'PAID',txHash:parsed.data.txHash}})};
 }
 return reply.code(400).send({error:'Unknown action'});
});

if(token) {
 const bot=new Bot(token);
 bot.command('start', async(ctx)=>{
   const startArg=ctx.match?.toString().trim();
   if(startArg && /^\d+$/.test(startArg) && startArg!==String(ctx.from.id)) {
     const referred=await db.user.findUnique({where:{id:startArg}});
     const me=await db.user.findUnique({where:{id:String(ctx.from.id)}});
     if(referred && !me) await db.user.create({data:{id:String(ctx.from.id),username:ctx.from.username,firstName:ctx.from.first_name,referredBy:startArg}});
   }
   const kb=new InlineKeyboard().webApp('⛽ Открыть Oil Master',webUrl);
   await ctx.reply('Добро пожаловать в Oil Master! Добывай нефть, улучшай вышки и соревнуйся с другими игроками.',{reply_markup:kb});
 });
 bot.command('help',ctx=>ctx.reply('Нажми «Открыть Oil Master», чтобы начать игру.'));
 bot.catch(err=>console.error('Bot error',err));
 bot.start();
}
const port=Number(process.env.PORT||3000);
await app.listen({port,host:'0.0.0.0'});
