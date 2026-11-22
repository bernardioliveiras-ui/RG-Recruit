const https = raw => {
  try {const url=new URL(raw);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}
  catch{return null;}
};

export function partnerCard(partner,dom=document) {
  const card=dom.createElement('article');card.className='public-partner-card';
  const emblem=dom.createElement('div');emblem.className='public-partner-symbol';
  const logo=https(partner.logo_url);
  if(logo){
    const img=dom.createElement('img');img.src=logo;img.alt='Logo de '+partner.name;
    img.loading='lazy';img.referrerPolicy='no-referrer';emblem.append(img);
  }else{
    const initials=dom.createElement('span');
    initials.textContent=String(partner.name||'?').trim().slice(0,2).toUpperCase();
    emblem.append(initials);
  }
  const category=dom.createElement('span');category.className='public-partner-category';
  category.textContent=partner.category||'Parceiro';
  const heading=dom.createElement('h3');heading.textContent=partner.name;
  const description=dom.createElement('p');description.textContent=partner.description||'Parceiro da rede Ramon Gama.';
  card.append(emblem,category,heading,description);
  const address=https(partner.url);
  if(address){
    const anchor=dom.createElement('a');anchor.href=address;anchor.target='_blank';anchor.rel='noopener noreferrer';
    anchor.textContent='Conhecer parceiro ↗';anchor.className='public-partner-link';
    card.append(anchor);
  }
  return card;
}

export async function loadPartners(target,status,{fetcher=fetch,dom=document}={}) {
  status.textContent='Carregando parceiros…';
  target.replaceChildren();
  try{
    const response=await fetcher('/api/partners',{cache:'no-store'});
    if(!response.ok)throw new Error('unavailable');
    const data=await response.json();
    if(!Array.isArray(data.partners))throw new Error('invalid');
    if(data.partners.length){
      target.replaceChildren(...data.partners.map(p=>partnerCard(p,dom)));
      status.textContent='';
    }else status.textContent='Novos parceiros serão apresentados em breve.';
  }catch{
    status.textContent='Não foi possível carregar os parceiros no momento.';
  }
}
