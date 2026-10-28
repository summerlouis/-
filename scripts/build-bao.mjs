import {build} from 'esbuild';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname,extname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Resolve this small backend through Node's file API. This also works on Windows
// workspaces whose ancestors cannot be enumerated by esbuild's native resolver.
const result=await build({
  entryPoints:['./worker/standalone.ts'],bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022',tsconfigRaw:{compilerOptions:{}},
  plugins:[{name:'bao-workspace-modules',setup(builder){
    builder.onResolve({filter:/.*/},args=>{
      if(args.path.startsWith('cloudflare:'))return {path:args.path,external:true};
      if(!args.path.startsWith('.'))throw Error('Unexpected backend dependency: '+args.path);
      const base=resolve(args.importer?dirname(args.importer):root,args.path);
      if(relative(root,base).startsWith('..'))throw Error('Module outside the project');
      const file=[base,base+'.ts',base+'.json'].find(p=>existsSync(p));
      if(!file)throw Error('Missing module: '+args.path);
      return {path:file,namespace:'bao-source'};
    });
    builder.onLoad({filter:/.*/,namespace:'bao-source'},args=>({contents:readFileSync(args.path,'utf8'),loader:extname(args.path)==='.json'?'json':'ts'}));
  }}],
});
const directory=resolve(root,'.wrangler/bao-build');mkdirSync(directory,{recursive:true});
writeFileSync(resolve(directory,'standalone.mjs'),result.outputFiles[0].contents);
console.log('Bao worker built from existing API modules.');
