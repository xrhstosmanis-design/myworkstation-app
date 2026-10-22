import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {sendWalletNotice,acceptedWalletMail} from '../src/services/ai-owner-wallet-notifications.js';

test('actual wallet Nodemailer transport accepts a single synthetic recipient through isolated local SMTP',async()=>{
  let envelopes=0,messages=0;const sockets=new Set();
  const server=createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.write('220 synthetic.local ESMTP\r\n');let buffer='',data=false;
    socket.on('data',chunk=>{
      buffer+=chunk.toString();let boundary;
      while((boundary=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);
        if(data){if(line==='.') {data=false;messages++;socket.write('250 synthetic-message-accepted\r\n')}continue}
        if(/^EHLO|^HELO/.test(line))socket.write('250-synthetic.local\r\n250 AUTH PLAIN\r\n');
        else if(/^AUTH PLAIN/.test(line))socket.write('235 Authentication successful\r\n');
        else if(/^MAIL FROM:/.test(line))socket.write('250 OK\r\n');
        else if(/^RCPT TO:/.test(line)){assert.match(line,/<owner@example\.invalid>/);envelopes++;socket.write('250 OK\r\n')}
        else if(line==='DATA'){data=true;socket.write('354 End with dot\r\n')}
        else if(line==='QUIT'){socket.end('221 Bye\r\n')}
        else socket.write('250 OK\r\n');
      }
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const result=await sendWalletNotice({companyId:'synthetic-wallet-smtp',to:'owner@example.invalid',subject:'Synthetic wallet test',text:'Synthetic notification, no customer delivery.'},{SMTP_HOST:'127.0.0.1',SMTP_PORT:String(server.address().port),SMTP_SECURE:'false',SMTP_USER:'synthetic@example.invalid',SMTP_PASSWORD:'synthetic-local-only',MAIL_FROM:'synthetic@example.invalid'});
    assert.equal(acceptedWalletMail(result,'owner@example.invalid'),true);assert.equal(envelopes,1);assert.equal(messages,1);
  }finally{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve))}
});
