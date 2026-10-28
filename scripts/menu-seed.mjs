import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
export function createSeed(configFile='wrangler.bao.jsonc') {
  const config=JSON.parse(readFileSync(configFile,'utf8')),menu=JSON.parse(readFileSync('config/menu-seed.json','utf8'));
  const quote=value=>"'"+String(value).replaceAll("'","''")+"'",store=quote('store:'+config.vars.STORE_ID),now=quote(new Date().toISOString());
  const rows=[];
  for(const p of menu.customProducts)rows.push(`INSERT INTO catalog_products (user_id,code,category,dish,fr,cents,active,created_at) VALUES (${store},${quote(p.code)},${quote(p.category)},${quote(p.dish)},${quote(p.fr)},${p.cents},${p.active},${now}) ON CONFLICT(user_id,code) DO NOTHING;`);
  for(const p of menu.overrides)rows.push(`INSERT INTO product_prices (user_id,code,cents,active,deleted,revision,updated_at) VALUES (${store},${quote(p.code)},${p.cents},${p.active},${p.deleted},1,${now}) ON CONFLICT(user_id,code) DO NOTHING;`);
  mkdirSync('.wrangler',{recursive:true});writeFileSync('.wrangler/catalog-seed.sql',rows.join('\n')+'\n');
  return '.wrangler/catalog-seed.sql';
}
if(process.argv[1]?.endsWith('menu-seed.mjs'))console.log(createSeed(process.argv[2]));
