import assert from 'node:assert/strict';
import test from 'node:test';
import { partnerCard } from '../public/partners.js';

class Node {
  constructor(tag){this.tag=tag;this.children=[];this.className='';this.textContent='';}
  append(...children){this.children.push(...children);}
}
const doc={createElement:tag=>new Node(tag)};
const walk=n=>[n,...n.children.flatMap(walk)];

test('public partner card renders literal untrusted text and safe outbound links',()=>{
  const malicious='<img src=x onerror=alert(1)>';
  const card=partnerCard({name:malicious,category:'Passagens aéreas',description:'Descrição',url:'javascript:alert(1)',logo_url:'',contact:'privado'},doc);
  assert.equal(walk(card).filter(n=>n.tag==='img').length,0);
  assert.ok(walk(card).some(n=>n.textContent===malicious));
  assert.ok(!walk(card).some(n=>n.href?.startsWith('javascript:')));
  assert.ok(!walk(card).some(n=>n.textContent==='privado'));
});

test('safe partner URLs open without granting an opener reference',()=>{
  const card=partnerCard({name:'Hotel Europa',category:'Hospedagem',description:'Apoio',url:'https://hotel.example',logo_url:'https://hotel.example/logo.png'},doc);
  const links=walk(card).filter(n=>n.tag==='a');
  assert.equal(links.length,1);
  assert.equal(links[0].target,'_blank');
  assert.equal(links[0].rel,'noopener noreferrer');
  assert.equal(links[0].href,'https://hotel.example/');
  assert.equal(walk(card).filter(n=>n.tag==='img').length,1);
});
