export function moneyToCents(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,7})(?:[.,](\d{1,2}))?$/u.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1])*100 + Number((match[2]||'').padEnd(2,'0'));
  return Number.isSafeInteger(cents) && cents>=100 && cents<=100000000 ? cents : null;
}

export function adOrderState(job,orders,now=Date.now()) {
  if (job.status==='archived') return {kind:'archived',label:'Arquivada'};
  const related=orders.filter(o=>o.job_id===job.id);
  const pending=related.some(o=>o.status==='pending');
  const paid=related.filter(o=>o.status==='paid');
  const live=paid.find(o=>o.starts_at_ms<=now&&o.expires_at_ms>now);
  if(live)return {kind:'active',label:pending?'Ativa · renovação pendente':'Ativa até '+new Date(Math.max(...paid.map(o=>o.expires_at_ms))).toLocaleDateString('pt-BR'),pending};
  if(pending)return {kind:'pending',label:'Aguardando pagamento'};
  if(paid.length)return {kind:'expired',label:'Expirada'};
  if(job.status==='published')return {kind:'legacy',label:'Publicação legada'};
  return {kind:'draft',label:'Rascunho'};
}
