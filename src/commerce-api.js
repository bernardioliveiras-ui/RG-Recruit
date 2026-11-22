import * as commerce from './commerce.js';

export const commerceMethods = new Map([
  ['companies',['GET','POST']], ['companies/:id',['PATCH']],
  ['orders',['GET','POST']], ['orders/:id/approve',['POST']], ['orders/:id/cancel',['POST']],
  ['categories',['GET','POST']], ['categories/:id',['PATCH','DELETE']],
  ['partners',['GET','POST']], ['partners/:id',['PATCH','DELETE']],
]);

const integer = (value,min,max) => Number.isSafeInteger(value) && value>=min && value<=max;
const clean = (value,min,max,allowNewlines=false) => typeof value==='string' &&
  value.trim().length>=min && value.trim().length<=max &&
  !(allowNewlines?/\u0000/u:/[\u0000-\u001f\u007f]/u).test(value) ? value.trim() : null;
const optionalText = (value,max,allowNewlines=false) => clean(value??'',0,max,allowNewlines);
const email = value => value==='' || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value) && value.length<=254);
const safeUrl = value => {
  if (!value) return true;
  try { const u=new URL(value); return u.protocol==='https:' && !u.username && !u.password && u.hostname.length>0 && value.length<=500; }
  catch { return false; }
};
const activeFlag = (raw,old) => raw===undefined ? (old?.active??1) : typeof raw==='boolean' ? Number(raw) : null;

function companyInput(raw,old) {
  const x={...old,...raw};
  const name=clean(x.name,2,160),country=clean(x.country,2,100);
  const contactEmail=optionalText(x.email,254),phone=optionalText(x.phone,40),active=activeFlag(raw.active,old);
  return name&&country&&contactEmail!==null&&email(contactEmail)&&phone!==null&&active!==null
    ? {name,country,email:contactEmail.toLowerCase(),phone,active} : null;
}

function orderInput(raw) {
  if (!integer(raw.job_id,1,Number.MAX_SAFE_INTEGER) || !integer(raw.company_id,1,Number.MAX_SAFE_INTEGER) ||
    !integer(raw.amount_cents,100,100000000) || !integer(raw.duration_days,1,365)) return null;
  return {job_id:raw.job_id,company_id:raw.company_id,amount_cents:raw.amount_cents,duration_days:raw.duration_days};
}

function categoryInput(raw,old) {
  const x={...old,...raw};
  const name=clean(x.name,2,80),position=x.position??0;
  return name&&integer(position,0,100000) ? {name,position} : null;
}

function partnerInput(raw,old) {
  const x={...old,...raw};
  const name=clean(x.name,2,160),description=optionalText(x.description,1600,true);
  const url=optionalText(x.url,500),logo_url=optionalText(x.logo_url,500);
  const contact=optionalText(x.contact,160),active=activeFlag(raw.active,old),position=x.position??0;
  return integer(x.category_id,1,Number.MAX_SAFE_INTEGER)&&name&&description!==null&&url!==null&&logo_url!==null&&
    safeUrl(url)&&safeUrl(logo_url)&&contact!==null&&active!==null&&integer(position,0,100000)
    ? {category_id:x.category_id,name,description,url,logo_url,contact,active,position} : null;
}

export async function handleCommerceAdmin(db,{resource,id,suffix,method,data,admin,respond}) {
  const bad=()=>respond({error:'Revise os dados enviados.'},400);
  const missing=()=>respond({error:'Registro não encontrado.'},404);
  const conflict=()=>respond({error:'Operação indisponível no estado atual.'},409);

  if(resource==='companies') {
    if(method==='GET') return respond({companies:await commerce.listCompanies(db)});
    const old=id?await commerce.getCompany(db,id):null;
    if(id&&!old)return missing();
    const value=companyInput(data,old);
    if(!value)return bad();
    const company=await commerce.saveCompany(db,value,id);
    return company?respond({company},id?200:201):missing();
  }

  if(resource==='orders') {
    if(method==='GET')return respond({orders:await commerce.listAdOrders(db)});
    if(id) {
      const row=await commerce.getOrder(db,id);
      if(!row)return missing();
      const updated=suffix==='/approve'
        ? await commerce.approveOrder(db,id,admin.id) : await commerce.cancelOrder(db,id);
      return updated?respond({order:updated}):conflict();
    }
    const order=orderInput(data);
    if(!order)return bad();
    if(!await commerce.getCompany(db,order.company_id) || !(await db.prepare('SELECT id FROM jobs WHERE id=?').bind(order.job_id).first())) return bad();
    const created=await commerce.createOrder(db,order);
    return created?respond({order:created},201):conflict();
  }

  if(resource==='categories') {
    if(method==='GET')return respond({categories:await commerce.listCategories(db)});
    if(method==='DELETE') {
      const result=await commerce.deleteCategory(db,id);
      return result==='deleted'?respond({deleted:true}):result==='in_use'?conflict():missing();
    }
    const old=id?await commerce.getCategory(db,id):null;
    if(id&&!old)return missing();
    const value=categoryInput(data,old);
    if(!value)return bad();
    const existing=(await commerce.listCategories(db)).some(c=>c.name.toLowerCase()===value.name.toLowerCase()&&c.id!==id);
    if(existing)return conflict();
    const category=await commerce.saveCategory(db,value,id);
    return category?respond({category},id?200:201):missing();
  }

  if(resource==='partners') {
    if(method==='GET')return respond({partners:await commerce.listPartners(db)});
    if(method==='DELETE')return await commerce.deletePartner(db,id)?respond({deleted:true}):missing();
    const old=id?await commerce.getPartner(db,id):null;
    if(id&&!old)return missing();
    const value=partnerInput(data,old);
    if(!value||!await commerce.getCategory(db,value.category_id))return bad();
    const partner=await commerce.savePartner(db,value,id);
    return partner?respond({partner},id?200:201):missing();
  }
  return missing();
}
