import {supabase} from './supabase.js';
import {getVerifiedUser,getAAL} from './auth.js';
const el=id=>document.getElementById(id);
const show=(message,error=false)=>{const box=el('status');box.textContent=message;box.className='status show '+(error?'error':'ok')};
async function boot(){
 const user=await getVerifiedUser();
 if(!user){location.replace('../auth/login.html');return}
 el('account').textContent=user.email||'Conta autenticada';
 const aal=await getAAL();
 const factors=await supabase.auth.mfa.listFactors();
 if(factors.error)throw factors.error;
 const verified=(factors.data?.totp||[]).filter(f=>f.status==='verified').length;
 el('mfaState').textContent='Fatores TOTP verificados: '+verified+' · Nível atual: '+(aal?.currentLevel||'indisponível');
 el('otherSessions').disabled=false;el('allSessions').disabled=false;
}
el('otherSessions').addEventListener('click',async()=>{
 if(!confirm('Encerrar as sessões desta conta em outros dispositivos?'))return;
 el('otherSessions').disabled=true;
 try{const {error}=await supabase.auth.signOut({scope:'others'});if(error)throw error;show('Solicitação de encerramento das outras sessões concluída. Tokens já emitidos podem expirar posteriormente.')}
 catch(e){show(e.message||'Falha ao encerrar outras sessões.',true)}
 finally{el('otherSessions').disabled=false}
});
el('allSessions').addEventListener('click',async()=>{
 if(!confirm('Encerrar todas as sessões, inclusive esta?'))return;
 el('allSessions').disabled=true;
 try{const {error}=await supabase.auth.signOut({scope:'global'});if(error)throw error;location.replace('../auth/login.html')}
 catch(e){show(e.message||'Falha ao encerrar as sessões.',true);el('allSessions').disabled=false}
});
void boot().catch(e=>show(e.message||'Não foi possível verificar a conta.',true));
