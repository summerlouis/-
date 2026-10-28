import './sites-env.mjs';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {networkInterfaces} from 'node:os';
import {spawnSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {createSeed} from './menu-seed.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const action=process.argv[2]||'start',port=process.env.BAO_PORT||'5173';
if(!/^\d+$/.test(port)||Number(port)<1024||Number(port)>65535)throw Error('BAO_PORT 必须是 1024 至 65535 的端口');
const wrangler=resolve('node_modules/wrangler/bin/wrangler.js');
if(!existsSync(wrangler))throw Error('请先在项目目录执行 npm ci 安装依赖');
const config='wrangler.bao.jsonc',persist='.wrangler/bao-local',vars='.dev.vars';
let content=existsSync(vars)?readFileSync(vars,'utf8'):'';
const secrets={};
for(const name of ['SESSION_SECRET','ADMIN_DEVICE_CODE','CASHIER_DEVICE_CODE','KITCHEN_DEVICE_CODE']){
  let value=content.match(new RegExp('^'+name+'=["\']?([^"\'\\r\\n]+)','m'))?.[1];
  if(!value){value=randomBytes(name==='SESSION_SECRET'?32:18).toString('base64url');content+='\n'+name+'='+value+'\n'}
  secrets[name]=value;
}
writeFileSync(vars,content,{mode:0o600});
mkdirSync('.wrangler',{recursive:true});
const environment={...process.env,CI:'true',WRANGLER_SEND_METRICS:'false',XDG_CONFIG_HOME:process.env.XDG_CONFIG_HOME||resolve('.sites-runtime/config')};
if(action==='setup'){
  const run=spawnSync(process.execPath,[wrangler,'d1','migrations','apply','DB','--local','--config',config,'--persist-to',persist],{stdio:'inherit',env:environment});
  if(run.status!==0)process.exit(run.status||1);
  const seed=spawnSync(process.execPath,[wrangler,'d1','execute','DB','--local','--config',config,'--persist-to',persist,'--file',createSeed(config)],{stdio:'inherit',env:environment});
  if(seed.status!==0)process.exit(seed.status||1);
  console.log('本地独立测试库已就绪。运行 npm run local:start。');
}else if(action==='start'){
  console.log('\nBao.Dumpling 模拟测试：不会扣款，数据与原云端分离。');
  console.log('管理设备配对码：'+secrets.ADMIN_DEVICE_CODE);
  console.log('收银设备配对码：'+secrets.CASHIER_DEVICE_CODE);
  console.log('厨房设备配对码：'+secrets.KITCHEN_DEVICE_CODE);
  console.log('首次打开店员页面输入相应配对码，配对保存 30 天。请勿分享管理配对码。');
  for(const host of ['127.0.0.1',...Object.values(networkInterfaces()).flat().filter(n=>n&&!n.internal&&n.family==='IPv4').map(n=>n.address)]){
    console.log(`顾客：http://${host}:${port}/  厨房：http://${host}:${port}/kitchen  收银：http://${host}:${port}/pos`);
  }
  console.log('保持此窗口运行。手机和 iPad 使用电脑的局域网 IP，不使用 127.0.0.1。');
  const child=spawn(process.execPath,[wrangler,'dev','--local','--config',config,'--persist-to',persist,'--ip','0.0.0.0','--port',port,'--inspector-port','0'],{stdio:'inherit',env:environment});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
  child.on('exit',code=>process.exitCode=code||0);
}else throw Error('用法：node scripts/bao-local.mjs setup|start');
