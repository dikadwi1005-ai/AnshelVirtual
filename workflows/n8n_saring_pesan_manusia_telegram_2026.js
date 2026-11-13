// Tempel di node Code 'Saring pesan manusia' pada workflow n8n Published.
// Setelah mengganti kode, klik Save lalu Publish. Tidak perlu buat workflow baru.
// Hanya metadata Telegram yang dikirim ke backend; file diunduh di Vercel setelah verifikasi owner.

const update=$input.first().json;
const message=update.message;
if(!message || !['group','supergroup'].includes(message.chat?.type) ||
  message.from?.is_bot!==false || !message.from?.id) return [];
const mediaType=message.voice?'voice':message.photo?.length?'photo':
  message.document?'document':message.audio?'audio':message.video?'video':null;
const text=typeof message.text==='string'?message.text:
  typeof message.caption==='string'?message.caption:'';
if(!text.trim()&&!mediaType)return [];
const old=message.reply_to_message;
const quoted=old && (typeof old.text==='string'||typeof old.caption==='string')?
  {sender:String(old.from?.first_name||old.from?.username||'anggota grup').slice(0,45),
   text:String(old.text||old.caption||'').slice(0,350)}:null;
const photos=(message.photo||[]).filter(x=>Number(x.file_size||0)<=1500000);
const file=mediaType==='photo'?photos.at(-1):mediaType?message[mediaType]:null;
const mimeType=mediaType==='photo'?'image/jpeg':
  mediaType==='voice'?'audio/ogg':String(file?.mime_type||'');
return [{json:{chatId:String(message.chat.id),userId:String(message.from.id),
  updateId:String(update.update_id),text:text.slice(0,1500),isBot:false,
  ...(quoted?{replyTo:quoted}:{}),
  ...(mediaType?{mediaType,fileId:String(file?.file_id||''),
    fileSize:Number(file?.file_size||0),mimeType}:{}),
  ...(Number.isSafeInteger(message.message_id)?{messageId:message.message_id}:{})}}];
