export function validateBundleConfig(value:any,products:any[],category:string){
 if(!value||!['包子','饺子'].includes(value.mainCategory)||value.mainCategory!==category||!Number.isInteger(value.mainCount)||value.mainCount<1||value.mainCount>6||!Number.isInteger(value.drinkCount)||value.drinkCount<1||value.drinkCount>6)throw Error('套餐份数须为1–6份 / Quantités : 1 à 6');
 for(const [key,cat] of [['mains',category],['drinks','饮品']])if(!Array.isArray(value[key])||!value[key].length||value[key].length>100||new Set(value[key]).size!==value[key].length||value[key].some((code:any)=>!products.some(p=>p.code===code&&!p.deleted&&p.category===cat)))throw Error('套餐可选商品无效 / Produits du menu invalides');
 return {mainCategory:value.mainCategory,mainCount:value.mainCount,drinkCount:value.drinkCount,mains:value.mains,drinks:value.drinks};
}
const standard=[['韭菜鸡蛋','Poireau et œuf'],['鲜肉','Porc'],['牛肉','Bœuf']];
const fillings:any={A1:[['韭菜鸡蛋','Poireau et œuf']],A2:[['猪肉白菜','Porc et chou'],['鲜肉','Porc'],['韭菜猪肉','Porc et poireau']],A3:[['红油牛肉包','Bao au bœuf pimenté'],['牛肉鲜肉包','Bao au bœuf frais']]};
const styles:any={'包子':[['清蒸','Vapeur'],['煎包','Poêlé']],'饺子':[['水煮','À l’eau'],['清蒸','Vapeur'],['煎饺','Poêlés']]};
export function bundleComponents(product:any,incoming:any,products:any[]){
 const rule=product.bundle;if(!rule){if(incoming?.length)throw Error('商品不是套餐 / Ce produit n’est pas un menu');return undefined}
 if(!Array.isArray(incoming)||incoming.length!==rule.mainCount+rule.drinkCount)throw Error('请选齐套餐组成 / Complétez le menu');
 return incoming.map((item:any,index:number)=>{const main=index<rule.mainCount;const p=products.find(p=>p.code===item?.code);if(!p?.active||!(main?rule.mains:rule.drinks).includes(p.code)||Number(item.qty)!==1)throw Error('套餐商品已售罄或选择无效 / Choix indisponible');
 const result:any={code:p.code,dish:p.dish,fr:p.fr,category:p.category,qty:1};
 if(main){const f=(fillings[p.code]||standard).find((x:string[])=>x[0]===item.filling),s=styles[p.category]?.find((x:string[])=>x[0]===item.style);if(!f||!s)throw Error('请选择套餐馅料和做法 / Garniture et cuisson requises');Object.assign(result,{filling:f[0],fillingFr:f[1],style:s[0],styleFr:s[1]})}return result});
}
