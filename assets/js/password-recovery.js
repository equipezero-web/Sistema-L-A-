import {supabase} from './supabase.js';
const get=id=>document.getElementById(id);
const status=(text,error=false)=>{const n=get('status');n.textContent=text;n.className='status show '+(error?'error':'ok')};
let recoverySession=false;
function setRecoveryMode(){recoverySession=true;get('requestForm').hidden=true;get('resetForm').hidden=false}
supabase.auth.onAuthStateChange((event)=>{
 if(event==='PASSWORD_RECOVERY')setRecoveryMode();
});
get('requestForm').addEventListener('submit',async event=>{
 event.preventDefault();
 const button=event.currentTarget.querySelector('button[type=submit]');
 button.disabled=true;
 try{
  const email=get('recoveryEmail').value.trim();
  const redirectTo=new URL('./recuperar.html',location.href).href;
  const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo});
  if(error)throw error;
  status('Se a conta existir, um link de recuperação será enviado ao e-mail informado.');
 }catch(e){status('Não foi possível iniciar a recuperação. Tente novamente.',true)}
 finally{button.disabled=false}
});
get('resetForm').addEventListener('submit',async event=>{
 event.preventDefault();
 const password=get('newPassword').value;
 if(!recoverySession){status('Abra esta página pelo link de recuperação recebido.',true);return}
 if(password.length<12||password.length>72||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password)){
  status('Use 12 a 72 caracteres com letras maiúsculas, minúsculas e número.',true);return
 }
 const button=event.currentTarget.querySelector('button[type=submit]');
 button.disabled=true;
 try{
  const {error}=await supabase.auth.updateUser({password});
  if(error)throw error;
  await supabase.auth.signOut({scope:'global'});
  get('resetForm').hidden=true;status('Senha atualizada. Entre novamente na sua conta.');
 }catch(e){status(e.message||'Não foi possível atualizar a senha.',true)}
 finally{button.disabled=false}
});
